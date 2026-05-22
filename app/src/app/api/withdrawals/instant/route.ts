import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getNetPosition,
  getPoolFromRegistry,
  recordWithdrawal,
} from "@/lib/registry/redis";
import { isRelayerConfigured } from "@/lib/relayer/keypair";
import { relayUsdcRefund } from "@/lib/relayer/transfer";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const bodySchema = z.object({
  poolAddress: z.string().regex(BASE58),
  amountUsdc: z.number().positive().max(1_000_000_000),
  cluster: z.enum(["mainnet", "devnet", "testnet"]).default("mainnet"),
});

export async function POST(req: NextRequest) {
  if (!isRelayerConfigured()) {
    return NextResponse.json(
      {
        error:
          "Instant withdrawals are not configured on the server. Set WITHDRAWAL_RELAYER_SECRET_KEY.",
      },
      { status: 503 }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      {
        error:
          "Sign in with your Solana wallet to authorize this withdrawal.",
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  const pool = await getPoolFromRegistry(parsed.data.poolAddress);
  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }
  if (!pool.relayerAuthorized) {
    return NextResponse.json(
      {
        error:
          "Manager has not authorized instant withdrawals on this pool yet. Ask them to enable it from the manager dashboard.",
      },
      { status: 409 }
    );
  }

  const position = await getNetPosition(session.wallet, parsed.data.poolAddress);
  if (parsed.data.amountUsdc > position.net + 1e-6) {
    return NextResponse.json(
      {
        error: `Withdrawal exceeds your tracked position. You have ${position.net.toFixed(2)} USDC available; requested ${parsed.data.amountUsdc.toFixed(2)}.`,
        position,
      },
      { status: 400 }
    );
  }

  let manager: PublicKey;
  let depositor: PublicKey;
  try {
    manager = new PublicKey(pool.manager);
    depositor = new PublicKey(session.wallet);
  } catch {
    return NextResponse.json(
      { error: "Invalid manager or depositor pubkey on record" },
      { status: 500 }
    );
  }

  try {
    const result = await relayUsdcRefund({
      manager,
      depositor,
      amountUsdc: parsed.data.amountUsdc,
      cluster: parsed.data.cluster,
      poolAddress: parsed.data.poolAddress,
    });

    await recordWithdrawal({
      signature: result.signature,
      poolAddress: parsed.data.poolAddress,
      depositor: session.wallet,
      amountUsdc: parsed.data.amountUsdc,
      ts: Date.now(),
      cluster: parsed.data.cluster,
    });

    return NextResponse.json({
      ok: true,
      signature: result.signature,
      explorerUrl: result.explorerUrl,
      amountUsdc: parsed.data.amountUsdc,
      cluster: parsed.data.cluster,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Withdrawal failed; please retry shortly.",
      },
      { status: 502 }
    );
  }
}
