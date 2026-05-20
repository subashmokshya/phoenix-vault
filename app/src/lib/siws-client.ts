import bs58 from "bs58";

export function buildSignInMessage(publicKey: string): string {
  const domain =
    typeof window !== "undefined" ? window.location.host : "phoenix-vault";
  const issuedAt = new Date().toISOString();
  return [
    `${domain} wants you to sign in with your Solana account:`,
    publicKey,
    "",
    "Sign in to Phoenix Vault",
    "",
    `URI: ${typeof window !== "undefined" ? window.location.origin : ""}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function signInWithWallet(params: {
  publicKey: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<{ ok: boolean; error?: string }> {
  const message = buildSignInMessage(params.publicKey);
  const messageBytes = new TextEncoder().encode(message);

  try {
    const signatureBytes = await params.signMessage(messageBytes);
    const signature = bs58.encode(signatureBytes);

    const res = await fetch("/api/auth/siws", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        message,
        signature,
        publicKey: params.publicKey,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error ?? "Sign-in failed" };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Signing cancelled",
    };
  }
}

export async function signOutWallet(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

export async function fetchSession(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.wallet ?? null;
  } catch {
    return null;
  }
}
