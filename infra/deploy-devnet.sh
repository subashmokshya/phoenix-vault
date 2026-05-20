#!/usr/bin/env bash
set -euo pipefail

echo "==> Configuring Solana devnet"
solana config set --url devnet

echo "==> Building Anchor program"
anchor build

echo "==> Deploying to devnet"
anchor deploy --provider.cluster devnet

PROGRAM_ID=$(solana address -k target/deploy/phoenix_vault-keypair.json)
echo ""
echo "Program ID: $PROGRAM_ID"
echo "Add to app/.env.local:"
echo "NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID"
