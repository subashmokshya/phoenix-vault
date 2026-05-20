import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

/**
 * Phoenix Vault integration tests.
 * Run: anchor test (requires local validator + Anchor CLI)
 */
describe("phoenix-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PhoenixVault as Program;
  const manager = Keypair.generate();
  const depositor = Keypair.generate();
  const platformTreasury = Keypair.generate();

  let usdcMint: PublicKey;
  let vaultPda: PublicKey;
  let vaultAuthority: PublicKey;
  let vaultUsdc: PublicKey;
  let managerUsdc: PublicKey;
  let depositorUsdc: PublicKey;
  let platformUsdc: PublicKey;

  const VAULT_INDEX = new anchor.BN(0);
  const PERF_FEE_BPS = 2000;
  const MGMT_FEE_BPS = 100;
  const DEPOSIT_CAP = new anchor.BN(1_000_000_000_000);
  const STRATEGY_TAG = 1;

  const nameBytes = Buffer.alloc(32);
  Buffer.from("Alpha Momentum").copy(nameBytes);

  before(async () => {
    await provider.connection.requestAirdrop(
      manager.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      depositor.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );

    usdcMint = await createMint(
      provider.connection,
      manager,
      manager.publicKey,
      null,
      6
    );

    managerUsdc = await createAccount(
      provider.connection,
      manager,
      usdcMint,
      manager.publicKey
    );
    depositorUsdc = await createAccount(
      provider.connection,
      depositor,
      usdcMint,
      depositor.publicKey
    );
    platformUsdc = await createAccount(
      provider.connection,
      manager,
      usdcMint,
      platformTreasury.publicKey
    );

    await mintTo(
      provider.connection,
      manager,
      usdcMint,
      depositorUsdc,
      manager,
      1_000_000_000
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        manager.publicKey.toBuffer(),
        VAULT_INDEX.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    [vaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority"), vaultPda.toBuffer()],
      program.programId
    );

    [vaultUsdc] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_usdc"), vaultPda.toBuffer()],
      program.programId
    );
  });

  it("initializes vault", async () => {
    await program.methods
      .initVault(
        VAULT_INDEX,
        Array.from(nameBytes) as number[],
        STRATEGY_TAG,
        PERF_FEE_BPS,
        MGMT_FEE_BPS,
        DEPOSIT_CAP
      )
      .accounts({
        manager: manager.publicKey,
        vault: vaultPda,
        vaultAuthority,
        vaultUsdc,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([manager])
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.manager.toString()).to.equal(manager.publicKey.toString());
    expect(vault.perfFeeBps).to.equal(PERF_FEE_BPS);
    expect(vault.paused).to.be.false;
    expect(vault.totalShares.toNumber()).to.equal(0);
  });

  it("rejects deposit when positions open", async () => {
    await program.methods
      .setPositionsOpen(true)
      .accounts({
        manager: manager.publicKey,
        vault: vaultPda,
      })
      .signers([manager])
      .rpc();

    const [depositorPosition] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("depositor"),
        vaultPda.toBuffer(),
        depositor.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .deposit(new anchor.BN(100_000_000))
        .accounts({
          depositor: depositor.publicKey,
          vault: vaultPda,
          vaultUsdc,
          depositorPosition,
          depositorUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor])
        .rpc();
      expect.fail("Should have thrown PositionsOpen");
    } catch (e: unknown) {
      const err = e as { error?: { errorCode?: { code?: string } } };
      expect(err.error?.errorCode?.code).to.equal("PositionsOpen");
    }

    await program.methods
      .setPositionsOpen(false)
      .accounts({ manager: manager.publicKey, vault: vaultPda })
      .signers([manager])
      .rpc();
  });

  it("deposits USDC and mints shares", async () => {
    const depositAmount = new anchor.BN(500_000_000);

    const [depositorPosition] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("depositor"),
        vaultPda.toBuffer(),
        depositor.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .deposit(depositAmount)
      .accounts({
        depositor: depositor.publicKey,
        vault: vaultPda,
        vaultUsdc,
        depositorPosition,
        depositorUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([depositor])
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    const position = await program.account.depositorPosition.fetch(
      depositorPosition
    );

    expect(vault.totalShares.toNumber()).to.be.greaterThan(0);
    expect(position.shares.toNumber()).to.equal(vault.totalShares.toNumber());
    expect(vault.navLamports.toNumber()).to.equal(depositAmount.toNumber());

    const vaultToken = await getAccount(provider.connection, vaultUsdc);
    expect(Number(vaultToken.amount)).to.equal(depositAmount.toNumber());
  });

  it("rejects unauthorized pause", async () => {
    try {
      await program.methods
        .setPaused(true)
        .accounts({
          manager: depositor.publicKey,
          vault: vaultPda,
        })
        .signers([depositor])
        .rpc();
      expect.fail("Should have thrown Unauthorized");
    } catch (e: unknown) {
      const err = e as { error?: { errorCode?: { code?: string } } };
      expect(err.error?.errorCode?.code).to.equal("ConstraintHasOne");
    }
  });

  it("manager can pause vault", async () => {
    await program.methods
      .setPaused(true)
      .accounts({ manager: manager.publicKey, vault: vaultPda })
      .signers([manager])
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.paused).to.be.true;
  });

  it("emergency withdraw when paused", async () => {
    const [depositorPosition] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("depositor"),
        vaultPda.toBuffer(),
        depositor.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .emergencyWithdraw()
      .accounts({
        depositor: depositor.publicKey,
        vault: vaultPda,
        vaultAuthority,
        vaultUsdc,
        depositorPosition,
        depositorUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    const position = await program.account.depositorPosition.fetch(
      depositorPosition
    );
    expect(position.shares.toNumber()).to.equal(0);
  });
});
