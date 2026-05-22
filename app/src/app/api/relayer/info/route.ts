import { NextResponse } from "next/server";
import {
  getRelayerPublicKey,
  isRelayerConfigured,
} from "@/lib/relayer/keypair";

export async function GET() {
  if (!isRelayerConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "Withdrawal relayer is not configured on the server. Set WITHDRAWAL_RELAYER_SECRET_KEY.",
      },
      { status: 200 }
    );
  }
  try {
    const pk = getRelayerPublicKey();
    return NextResponse.json({
      configured: true,
      publicKey: pk.toBase58(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        configured: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
