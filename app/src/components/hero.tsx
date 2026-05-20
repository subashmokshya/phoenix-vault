"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "./ui/button";

export function Hero() {
  return (
    <section className="mb-16 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <p className="text-sm font-medium text-accent mb-4 tracking-wide uppercase">
          Built on Phoenix · Solana
        </p>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.1] mb-6">
          Invest in the best
          <br />
          <span className="text-accent">perp traders</span>
        </h1>
        <p className="text-lg text-muted max-w-xl mx-auto mb-8 leading-relaxed">
          Deposit USDC into curated vaults. Top managers trade Phoenix perpetuals
          on your behalf. Transparent fees. Non-custodial.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/explore">
            <Button size="lg">Explore Pools</Button>
          </Link>
          <Link href="/create">
            <Button size="lg" variant="secondary">
              Launch a Pool
            </Button>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
