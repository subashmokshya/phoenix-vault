import { PublicKey } from "@solana/web3.js";
import { PHOENIX_VAULT_PROGRAM_ID } from "./idl";

const programId = new PublicKey(PHOENIX_VAULT_PROGRAM_ID);

export function findVaultPda(
  manager: PublicKey,
  vaultIndex: bigint
): [PublicKey, number] {
  const indexBuf = Buffer.alloc(8);
  indexBuf.writeBigUInt64LE(vaultIndex);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), manager.toBuffer(), indexBuf],
    programId
  );
}

export function findVaultAuthorityPda(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority"), vault.toBuffer()],
    programId
  );
}

export function findVaultUsdcPda(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_usdc"), vault.toBuffer()],
    programId
  );
}

export function findDepositorPositionPda(
  vault: PublicKey,
  depositor: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("depositor"), vault.toBuffer(), depositor.toBuffer()],
    programId
  );
}

export function findWithdrawRequestPda(
  vault: PublicKey,
  depositor: PublicKey,
  shares: bigint
): [PublicKey, number] {
  const sharesBuf = Buffer.alloc(8);
  sharesBuf.writeBigUInt64LE(shares);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("withdraw"),
      vault.toBuffer(),
      depositor.toBuffer(),
      sharesBuf,
    ],
    programId
  );
}
