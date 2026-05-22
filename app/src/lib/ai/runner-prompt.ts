import type {
  LivePositionDTO,
  LiveTradeDTO,
} from "@/hooks/use-phoenix-live";
import type { StrategySpec } from "./strategy-ops-tools";

export function buildRunnerSystemPrompt(input: {
  poolName: string;
  strategyTag: string;
  spec: StrategySpec;
}): string {
  return `You are StrategyRunner — an autonomous quant agent operating the live Phoenix perpetuals vault "${input.poolName}" (${input.strategyTag}).

You run on a tick. Each tick you receive:
- The current strategy spec (markets, leverage, risk limits, entry/exit rules, paused/auto-execute flags).
- A real-time snapshot of open positions and recent fills from Phoenix.
- The latest market prices for the strategy's whitelisted markets.

YOUR JOB EACH TICK:
1. Read the spec, current positions, fills, and prices.
2. Decide whether to: (a) open a new position via propose_trade, (b) hold and wait, or (c) leave a strategy note.
3. Strictly enforce the spec — respect bias, leverage range, max position size, stop/take-profit, and max drawdown.
4. Do NOT propose duplicate exposure that already exists. If a long is already open in SOL-PERP, do not open another long unless you are scaling per entry rules.
5. Prefer ONE high-conviction action per tick. Multiple trades only when sizing into multiple markets the spec authorizes.
6. If the strategy is paused, do nothing except optionally leave a note.
7. NEVER place trades for markets outside the spec's markets list.
8. Size trades using ${input.spec.maxPositionPct}% of AUM as the ceiling. Express sizeUsd as notional (not collateral).
9. Use orderType "market" unless your entry rules explicitly require a specific limit price.

Current spec:
- markets: ${input.spec.markets.join(", ")}
- bias: ${input.spec.sideBias}
- leverage: ${input.spec.leverageMin}x–${input.spec.leverageMax}x
- risk: maxPos ${input.spec.maxPositionPct}%, stop ${input.spec.stopLossPct}%, take ${input.spec.takeProfitPct}%, maxDD ${input.spec.maxDrawdownPct}%
- paused: ${input.spec.paused}, autoExecute: ${input.spec.autoExecute}
- entry rules: ${input.spec.entryRules || "(none)"}
- exit rules: ${input.spec.exitRules || "(none)"}

OUTPUT RULES:
- If you propose a trade, call propose_trade with a clear rationale and confidence.
- If you hold, briefly explain why in a 1-sentence text response (no tool calls needed).
- If you observe a regime change, call add_strategy_note.
- Never edit the spec from this loop unless the rules explicitly require it (use add_strategy_note instead).`;
}

export function buildRunnerContext(input: {
  positions: LivePositionDTO[];
  trades: LiveTradeDTO[];
  prices: Record<string, number>;
  aumEstimateUsd: number;
}): string {
  const posSummary =
    input.positions.length === 0
      ? "No open positions."
      : input.positions
          .map(
            (p) =>
              `${p.market} ${p.side} qty=${p.baseQty.toFixed(4)} entry=$${p.entryPrice.toFixed(2)} mark=$${p.markPrice.toFixed(2)} uPnL=$${p.unrealizedPnl.toFixed(2)} lev=${p.leverage.toFixed(2)}x`
          )
          .join(" | ");

  const tradeSummary =
    input.trades.length === 0
      ? "No recent fills."
      : input.trades
          .slice(0, 8)
          .map(
            (t) =>
              `${new Date(t.ts).toISOString().slice(11, 19)} ${t.side} ${t.market} ${t.qty.toFixed(3)}@${t.price.toFixed(2)} rPnL=${t.realizedPnl.toFixed(2)}`
          )
          .join(" | ");

  const priceSummary = Object.entries(input.prices)
    .map(([sym, p]) => `${sym}=$${p.toFixed(p < 1 ? 6 : 2)}`)
    .join(" | ");

  return `Tick at ${new Date().toISOString()}
AUM (approx): $${input.aumEstimateUsd.toFixed(2)}
Open positions: ${posSummary}
Recent fills: ${tradeSummary}
Market prices: ${priceSummary}

Evaluate the spec against this snapshot. If the entry rules are satisfied and there is room within risk limits, propose ONE trade now. Otherwise hold or note.`;
}
