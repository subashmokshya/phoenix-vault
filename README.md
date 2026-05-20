# Phoenix Vault

Decentralized vault hub for [Phoenix](https://docs.phoenix.trade/) perpetual futures on Solana. Deposit USDC into manager-run pools; automated trading via Phoenix + Flight builder fees.

## Stack

| Layer | Tech |
|-------|------|
| On-chain | Anchor (`programs/phoenix-vault`) |
| Frontend | Next.js 14, Tailwind, Framer Motion, Solana Wallet Adapter |
| Backend | Next.js API routes, Drizzle + Neon Postgres |
| Indexer | Vercel Cron → Phoenix REST API |
| Trading | `@ellipsis-labs/rise` SDK + Phoenix Flight |

## Quick start

```bash
# Install
cd app && npm install

# Copy env
cp .env.example .env.local
# Fill JWT_SECRET (optional DATABASE_URL for live DB)

# Dev server (works without DB — uses demo pools)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Monorepo layout

```
programs/phoenix-vault/   Anchor program
app/                      Next.js app (deploy this to Vercel)
packages/sdk/             Phoenix + vault helpers
packages/indexer/         Standalone indexer (optional)
tests/                    Anchor integration tests
infra/                    Deploy scripts
```

## Anchor program (devnet)

Requires [Anchor 0.30+](https://www.anchor-lang.com/) and Solana CLI.

```bash
anchor build
anchor deploy --provider.cluster devnet
# Update NEXT_PUBLIC_PROGRAM_ID in app/.env.local
```

## Database (optional)

```bash
cd app
export DATABASE_URL=postgresql://...
npm run db:migrate
npm run db:seed
```

Without `DATABASE_URL`, the app serves curated demo pools.

## Vercel deploy

```bash
cd app
npx vercel --prod
```

Set environment variables from `app/.env.example`. Root directory for Vercel: **`app`**.

Cron jobs (NAV every minute, leaderboard every 5 min) are defined in `app/vercel.json`.

## Fees

1. **Phoenix Flight** — 5 bps on every routed trade → platform treasury
2. **Vault performance fee** — high-water-mark split (default 80% manager / 20% platform)

## Mainnet checklist

See [RUNBOOK.md](./RUNBOOK.md).

## Disclaimer

Not available in the U.S. or sanctioned jurisdictions. Perpetual futures involve substantial risk. Smart contracts require audit before mainnet deployment with real funds.
