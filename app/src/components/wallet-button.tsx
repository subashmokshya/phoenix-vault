"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Button } from "./ui/button";

export function WalletButton() {
  const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

  if (!hasPrivy) {
    return (
      <Button size="sm" variant="secondary" disabled title="Set NEXT_PUBLIC_PRIVY_APP_ID">
        Connect
      </Button>
    );
  }

  return <WalletButtonInner />;
}

function WalletButtonInner() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const wallet = user?.wallet?.address;

  if (ready && authenticated && wallet) {
    return (
      <Button variant="ghost" size="sm" onClick={logout}>
        {wallet.slice(0, 4)}…{wallet.slice(-4)}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={login} disabled={!ready}>
      Connect
    </Button>
  );
}
