# Phoenix Vault — Runbook

## Local development

1. `cd app && npm install && npm run dev`
2. App runs with mock pools if `DATABASE_URL` is unset.
3. Connect wallet via Solana Wallet Adapter (Phantom, Solflare, etc.). Sign the SIWS message to authenticate API routes.

## Devnet program deploy

```bash
# Prerequisites: anchor 0.30.1, solana devnet SOL
solana config set --url devnet
solana airdrop 2

anchor build
anchor deploy --provider.cluster devnet

# Record program ID
solana address -k target/deploy/phoenix_vault-keypair.json
```

Update `NEXT_PUBLIC_PROGRAM_ID` and `Anchor.toml` `[programs.devnet]`.

## Phoenix mainnet access

Phoenix is in private beta. You need:

- Access code → `POST /v1/invite/activate`
- Or referral → `POST /v1/invite/activate-with-referral`

See [Phoenix docs](https://docs.phoenix.trade/sdk/rise).

## Flight builder registration (one-time)

```typescript
import { registerFlightBuilder } from "@phoenix-vault/sdk";

await registerFlightBuilder({
  builderAuthority: process.env.NEXT_PUBLIC_FLIGHT_BUILDER!,
  feeBps: 5n,
});
```

Fees accrue to the builder's Phoenix trader account.

## Vercel production

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SOLANA_RPC` | Yes | Mainnet or devnet RPC URL |
| `JWT_SECRET` | Yes | Random 32+ chars for SIWS sessions |
| `JWT_SECRET` | Yes | Random 32+ chars |
| `DATABASE_URL` | Recommended | Neon Postgres |
| `CRON_SECRET` | Recommended | Protects `/api/cron/*` |
| `NEXT_PUBLIC_PHOENIX_API_URL` | Yes | `https://perp-api.phoenix.trade` |
| `NEXT_PUBLIC_SOLANA_RPC` | Yes | Mainnet RPC |
| `NEXT_PUBLIC_PROGRAM_ID` | After deploy | Devnet/mainnet program |

**Root directory:** `app`

## Audit before mainnet

- [ ] Anchor program audit (Ottersec, Neodyme, Zellic)
- [ ] NAV oracle v2 (on-chain Phoenix state + Pyth)
- [ ] Withdrawal queue stress test with open positions
- [ ] Flight builder fee accounting
- [ ] Geo restriction disclaimer in UI

## v1 limitations

- Deposits/withdrawals only when vault is **flat** (no open perp positions)
- NAV updates via off-chain crank (`update_nav`) when DB connected
- `manager_place_order` CPI to Phoenix is scaffolded in SDK; full CPI wiring post-audit
- Program ID in repo is placeholder until `anchor deploy`

## Support

- Phoenix: [docs.phoenix.trade](https://docs.phoenix.trade/)
- Rise SDK: [github.com/Ellipsis-Labs/rise-public](https://github.com/Ellipsis-Labs/rise-public)
