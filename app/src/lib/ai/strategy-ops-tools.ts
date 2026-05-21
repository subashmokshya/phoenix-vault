export const MARKETS = [
  "SOL-PERP",
  "BTC-PERP",
  "ETH-PERP",
  "BONK-PERP",
  "JUP-PERP",
] as const;
export type Market = (typeof MARKETS)[number];

export const SIDE_BIAS = ["long", "short", "neutral"] as const;
export type SideBias = (typeof SIDE_BIAS)[number];

export type StrategySpec = {
  markets: Market[];
  sideBias: SideBias;
  leverageMin: number;
  leverageMax: number;
  maxPositionPct: number; // % of AUM per position
  stopLossPct: number; // hard stop, % from entry
  takeProfitPct: number; // % from entry
  maxDrawdownPct: number; // halt strategy if pool DD exceeds
  entryRules: string;
  exitRules: string;
  paused: boolean;
  autoExecute: boolean;
  notes: string;
  updatedAt: number;
};

export const DEFAULT_SPEC: StrategySpec = {
  markets: ["SOL-PERP"],
  sideBias: "long",
  leverageMin: 1,
  leverageMax: 3,
  maxPositionPct: 20,
  stopLossPct: 3,
  takeProfitPct: 6,
  maxDrawdownPct: 15,
  entryRules:
    "Long when 4H momentum > 0 and funding < 5bps. Add on pullbacks to 20EMA.",
  exitRules:
    "Exit on 4H close below 20EMA or stop-loss. Trim 50% at first target.",
  paused: false,
  autoExecute: false,
  notes: "",
  updatedAt: Date.now(),
};

export type ProposedTrade = {
  id: string;
  market: Market;
  side: "buy" | "sell";
  sizeUsd: number;
  orderType: "market" | "limit";
  limitPrice?: number;
  rationale: string;
  confidence: "low" | "medium" | "high";
  createdAt: number;
};

export type StrategyOpsToolName =
  | "set_markets"
  | "set_side_bias"
  | "set_leverage_range"
  | "set_risk_limits"
  | "set_entry_rules"
  | "set_exit_rules"
  | "set_paused"
  | "set_auto_execute"
  | "add_strategy_note"
  | "propose_trade";

export type StrategyOpsToolCall = {
  name: StrategyOpsToolName;
  arguments: Record<string, unknown>;
};

export const STRATEGY_OPS_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "set_markets",
      description: `Update the set of perpetual markets the strategy trades. Allowed: ${MARKETS.join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          markets: {
            type: "array",
            items: { type: "string", enum: [...MARKETS] },
            minItems: 1,
            maxItems: 5,
          },
        },
        required: ["markets"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_side_bias",
      description:
        "Set the strategy's directional bias: 'long', 'short', or 'neutral' (market-neutral / both sides allowed).",
      parameters: {
        type: "object",
        properties: {
          bias: { type: "string", enum: [...SIDE_BIAS] },
        },
        required: ["bias"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_leverage_range",
      description:
        "Set min and max leverage. Conservative: 1-2x. Standard directional: 2-5x. Aggressive: 5-10x. HFT: 1-3x.",
      parameters: {
        type: "object",
        properties: {
          min: { type: "number", minimum: 1, maximum: 10 },
          max: { type: "number", minimum: 1, maximum: 20 },
        },
        required: ["min", "max"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_risk_limits",
      description:
        "Set risk limits as percentages. maxPositionPct = max single-position size as % of AUM. stopLossPct = hard stop from entry. takeProfitPct = first target from entry. maxDrawdownPct = pool drawdown after which the strategy pauses itself.",
      parameters: {
        type: "object",
        properties: {
          maxPositionPct: { type: "number", minimum: 1, maximum: 100 },
          stopLossPct: { type: "number", minimum: 0.1, maximum: 50 },
          takeProfitPct: { type: "number", minimum: 0.1, maximum: 100 },
          maxDrawdownPct: { type: "number", minimum: 1, maximum: 80 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_entry_rules",
      description:
        "Replace the entry-rule text. Be specific: signal, timeframe, confirmation, sizing.",
      parameters: {
        type: "object",
        properties: { rules: { type: "string" } },
        required: ["rules"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_exit_rules",
      description: "Replace the exit-rule text. Include stops, trailing logic, scale-outs.",
      parameters: {
        type: "object",
        properties: { rules: { type: "string" } },
        required: ["rules"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_paused",
      description:
        "Pause or resume the strategy. Pause when conditions are unsafe (regime shift, max DD hit, news event).",
      parameters: {
        type: "object",
        properties: { paused: { type: "boolean" } },
        required: ["paused"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_auto_execute",
      description:
        "Toggle auto-execution: when true, proposed trades flow straight to Phoenix; when false, the manager must approve each trade.",
      parameters: {
        type: "object",
        properties: { enabled: { type: "boolean" } },
        required: ["enabled"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_strategy_note",
      description:
        "Append a timestamped note to the strategy journal (regime change, observation, anomaly).",
      parameters: {
        type: "object",
        properties: { note: { type: "string" } },
        required: ["note"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_trade",
      description:
        "Propose a single trade to the manager. The trade goes into the proposed-trades queue for approval (or auto-executes if autoExecute is on). Use sizeUsd as notional, not base units. Always give a clear rationale.",
      parameters: {
        type: "object",
        properties: {
          market: { type: "string", enum: [...MARKETS] },
          side: { type: "string", enum: ["buy", "sell"] },
          sizeUsd: { type: "number", minimum: 100, maximum: 1_000_000 },
          orderType: { type: "string", enum: ["market", "limit"] },
          limitPrice: { type: "number" },
          rationale: { type: "string" },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
        required: ["market", "side", "sizeUsd", "orderType", "rationale", "confidence"],
      },
    },
  },
];

export type ApplyOpsResult = {
  next: StrategySpec;
  ack: string;
  proposedTrade?: ProposedTrade;
  note?: { ts: number; text: string };
};

export function applyOpsToolCall(
  spec: StrategySpec,
  call: StrategyOpsToolCall
): ApplyOpsResult {
  const next: StrategySpec = { ...spec, updatedAt: Date.now() };
  let ack = "ok";
  let proposedTrade: ProposedTrade | undefined;
  let note: { ts: number; text: string } | undefined;

  switch (call.name) {
    case "set_markets": {
      const raw = call.arguments.markets;
      const list = Array.isArray(raw) ? (raw as unknown[]) : [];
      const filtered = list.filter((m): m is Market =>
        (MARKETS as readonly string[]).includes(String(m))
      );
      if (filtered.length === 0) {
        ack = "no valid markets provided";
      } else {
        next.markets = filtered.slice(0, 5);
        ack = `markets set to ${next.markets.join(", ")}`;
      }
      break;
    }
    case "set_side_bias": {
      const v = String(call.arguments.bias ?? "");
      if ((SIDE_BIAS as readonly string[]).includes(v)) {
        next.sideBias = v as SideBias;
        ack = `bias set to ${v}`;
      } else ack = `invalid bias "${v}"`;
      break;
    }
    case "set_leverage_range": {
      const min = clamp(Number(call.arguments.min ?? 1), 1, 10);
      const max = clamp(Number(call.arguments.max ?? 3), min, 20);
      next.leverageMin = min;
      next.leverageMax = max;
      ack = `leverage ${min}–${max}x`;
      break;
    }
    case "set_risk_limits": {
      const a = call.arguments;
      if (typeof a.maxPositionPct === "number")
        next.maxPositionPct = clamp(a.maxPositionPct, 1, 100);
      if (typeof a.stopLossPct === "number")
        next.stopLossPct = clamp(a.stopLossPct, 0.1, 50);
      if (typeof a.takeProfitPct === "number")
        next.takeProfitPct = clamp(a.takeProfitPct, 0.1, 100);
      if (typeof a.maxDrawdownPct === "number")
        next.maxDrawdownPct = clamp(a.maxDrawdownPct, 1, 80);
      ack = `risk limits updated`;
      break;
    }
    case "set_entry_rules": {
      next.entryRules = String(call.arguments.rules ?? "").slice(0, 2000);
      ack = "entry rules updated";
      break;
    }
    case "set_exit_rules": {
      next.exitRules = String(call.arguments.rules ?? "").slice(0, 2000);
      ack = "exit rules updated";
      break;
    }
    case "set_paused": {
      next.paused = Boolean(call.arguments.paused);
      ack = next.paused ? "strategy paused" : "strategy resumed";
      break;
    }
    case "set_auto_execute": {
      next.autoExecute = Boolean(call.arguments.enabled);
      ack = next.autoExecute
        ? "auto-execute enabled — AI trades fire without approval"
        : "auto-execute disabled — manager approves each trade";
      break;
    }
    case "add_strategy_note": {
      const text = String(call.arguments.note ?? "").slice(0, 500);
      if (text) {
        note = { ts: Date.now(), text };
        next.notes = `${new Date(note.ts).toLocaleString()} — ${text}\n${spec.notes}`.slice(0, 4000);
        ack = "note appended";
      } else ack = "empty note ignored";
      break;
    }
    case "propose_trade": {
      const a = call.arguments;
      const market = String(a.market ?? "");
      const side = String(a.side ?? "");
      const orderType = String(a.orderType ?? "market");
      if (!(MARKETS as readonly string[]).includes(market)) {
        ack = `invalid market "${market}"`;
        break;
      }
      if (side !== "buy" && side !== "sell") {
        ack = `invalid side "${side}"`;
        break;
      }
      proposedTrade = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        market: market as Market,
        side,
        sizeUsd: clamp(Number(a.sizeUsd ?? 0), 100, 1_000_000),
        orderType: orderType === "limit" ? "limit" : "market",
        limitPrice:
          typeof a.limitPrice === "number" ? Number(a.limitPrice) : undefined,
        rationale: String(a.rationale ?? "").slice(0, 600),
        confidence:
          a.confidence === "low" || a.confidence === "high"
            ? (a.confidence as "low" | "high")
            : "medium",
        createdAt: Date.now(),
      };
      ack = `proposed ${side} ${market} ($${proposedTrade.sizeUsd.toLocaleString()})`;
      break;
    }
  }

  return { next, ack, proposedTrade, note };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function buildOpsSystemPrompt(input: {
  poolName: string;
  strategyTag: string;
  spec: StrategySpec;
}): string {
  return `You are StrategyOps, an embedded quant co-pilot for the live Phoenix vault "${input.poolName}" (${input.strategyTag}). The manager is monitoring this pool in real time and uses you to:

1. Adjust strategy parameters using tools (markets, leverage, risk limits, entry/exit rules, pause, auto-execute, notes).
2. Propose discrete trades via the propose_trade tool. Be specific (market, side, sizeUsd notional, order type, limit price when limit, rationale, confidence).
3. Analyze the live positions and recent fills the manager mentions, and react with concrete recommendations.

Current strategy spec:
- markets: ${input.spec.markets.join(", ")}
- bias: ${input.spec.sideBias}
- leverage: ${input.spec.leverageMin}x–${input.spec.leverageMax}x
- risk: maxPos ${input.spec.maxPositionPct}%, stop ${input.spec.stopLossPct}%, target ${input.spec.takeProfitPct}%, maxDD ${input.spec.maxDrawdownPct}%
- paused: ${input.spec.paused}, autoExecute: ${input.spec.autoExecute}
- entryRules: ${input.spec.entryRules || "(none)"}
- exitRules: ${input.spec.exitRules || "(none)"}

Rules:
- Be opinionated and concrete. No "it depends" hedging.
- Respect the bias unless the manager explicitly asks to widen it.
- Position sizing: never exceed maxPositionPct unless the manager tells you to update it first.
- If proposing a trade, always include rationale and confidence.
- Use add_strategy_note when you observe regime shifts or anomalies.
- Never call propose_trade and full strategy edits in the same turn unless the manager asked for both.`;
}
