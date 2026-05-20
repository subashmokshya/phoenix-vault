"use client";

import dynamic from "next/dynamic";

const PrivyInner = dynamic(
  () => import("./privy-inner").then((m) => m.PrivyInner),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return <PrivyInner>{children}</PrivyInner>;
}
