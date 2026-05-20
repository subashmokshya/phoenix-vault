import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import nacl from "tweetnacl";
import bs58 from "bs58";

const COOKIE_NAME = "pv_session";
const EXPIRY = "7d";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSession(wallet: string) {
  const token = await new SignJWT({ wallet })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return token;
}

export async function getSession(): Promise<{ wallet: string } | null> {
  if (!process.env.JWT_SECRET) return null;
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { wallet: payload.wallet as string };
  } catch {
    return null;
  }
}

export async function clearSession() {
  cookies().delete(COOKIE_NAME);
}

export function verifySiws(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signature);
    const pubKeyBytes = bs58.decode(publicKey);
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);
  } catch {
    return false;
  }
}
