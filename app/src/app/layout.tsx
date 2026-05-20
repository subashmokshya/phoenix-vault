import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Phoenix Vault — Decentralized Perp Pools",
  description:
    "Deposit into top-performing Phoenix perpetual futures vaults. Non-custodial, automated, transparent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        <Providers>
          <Navbar />
          <main className="min-h-screen">{children}</main>
          <footer className="border-t border-border py-8 mt-16">
            <div className="mx-auto max-w-6xl px-6 text-center text-sm text-muted">
              <p>
                Phoenix Vault is not available in the U.S. or sanctioned jurisdictions.
              </p>
              <p className="mt-2">
                Trading perpetual futures involves substantial risk of loss.
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
