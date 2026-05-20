import { NextRequest, NextResponse } from "next/server";
import { createSession, verifySiws } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  message: z.string(),
  signature: z.string(),
  publicKey: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { message, signature, publicKey } = parsed.data;

  if (!message.includes(publicKey)) {
    return NextResponse.json({ error: "Message mismatch" }, { status: 400 });
  }

  if (!verifySiws(message, signature, publicKey)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  await createSession(publicKey);
  return NextResponse.json({ ok: true, wallet: publicKey });
}
