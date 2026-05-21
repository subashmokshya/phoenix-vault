export const STRATEGY_TAGS = [
  "Momentum",
  "Market Neutral",
  "Volatility",
  "Macro",
  "HFT",
  "Arbitrage",
] as const;

export type StrategyTag = (typeof STRATEGY_TAGS)[number];

export type PoolDraft = {
  name: string;
  description: string;
  strategyTag: StrategyTag;
  perfFeePct: number;
  mgmtFeePct: number;
  playbook: string;
};

export const DEFAULT_DRAFT: PoolDraft = {
  name: "",
  description: "",
  strategyTag: "Momentum",
  perfFeePct: 20,
  mgmtFeePct: 1,
  playbook: "",
};

export type ToolName =
  | "set_pool_name"
  | "set_description"
  | "set_strategy_tag"
  | "set_perf_fee"
  | "set_mgmt_fee"
  | "set_strategy_playbook"
  | "apply_full_draft";

export type ToolCall = {
  name: ToolName;
  arguments: Record<string, unknown>;
};

export const GROQ_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "set_pool_name",
      description:
        "Set the pool's display name. Keep under 32 characters, evocative, professional.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Pool name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_description",
      description:
        "Set the short marketing description shown to depositors (1-2 sentences).",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string" },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_strategy_tag",
      description: `Set the strategy category. Must be one of: ${STRATEGY_TAGS.join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          tag: { type: "string", enum: [...STRATEGY_TAGS] },
        },
        required: ["tag"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_perf_fee",
      description:
        "Set the performance fee percentage (0-50). Industry standard is 15-25%.",
      parameters: {
        type: "object",
        properties: {
          percent: { type: "number", minimum: 0, maximum: 50 },
        },
        required: ["percent"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_mgmt_fee",
      description:
        "Set the management fee percentage (0-10). Industry standard is 0-2%.",
      parameters: {
        type: "object",
        properties: {
          percent: { type: "number", minimum: 0, maximum: 10 },
        },
        required: ["percent"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_strategy_playbook",
      description:
        "Set the detailed strategy playbook: entry/exit rules, position sizing, markets traded, risk management. Markdown allowed.",
      parameters: {
        type: "object",
        properties: {
          playbook: { type: "string" },
        },
        required: ["playbook"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_full_draft",
      description:
        "Apply a complete pool draft at once. Use this when the user wants you to design the whole pool in one go.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          strategyTag: { type: "string", enum: [...STRATEGY_TAGS] },
          perfFeePct: { type: "number", minimum: 0, maximum: 50 },
          mgmtFeePct: { type: "number", minimum: 0, maximum: 10 },
          playbook: { type: "string" },
        },
        required: [
          "name",
          "description",
          "strategyTag",
          "perfFeePct",
          "mgmtFeePct",
          "playbook",
        ],
      },
    },
  },
];

export function applyToolCall(
  draft: PoolDraft,
  call: ToolCall
): { next: PoolDraft; ack: string } {
  const next = { ...draft };
  let ack = "ok";

  switch (call.name) {
    case "set_pool_name": {
      const v = String(call.arguments.name ?? "").slice(0, 32);
      next.name = v;
      ack = `pool name set to "${v}"`;
      break;
    }
    case "set_description": {
      const v = String(call.arguments.description ?? "").slice(0, 500);
      next.description = v;
      ack = "description updated";
      break;
    }
    case "set_strategy_tag": {
      const raw = String(call.arguments.tag ?? "");
      if ((STRATEGY_TAGS as readonly string[]).includes(raw)) {
        next.strategyTag = raw as StrategyTag;
        ack = `strategy tag set to ${raw}`;
      } else {
        ack = `invalid strategy tag "${raw}"`;
      }
      break;
    }
    case "set_perf_fee": {
      const v = clamp(Number(call.arguments.percent ?? 20), 0, 50);
      next.perfFeePct = v;
      ack = `performance fee set to ${v}%`;
      break;
    }
    case "set_mgmt_fee": {
      const v = clamp(Number(call.arguments.percent ?? 1), 0, 10);
      next.mgmtFeePct = v;
      ack = `management fee set to ${v}%`;
      break;
    }
    case "set_strategy_playbook": {
      const v = String(call.arguments.playbook ?? "");
      next.playbook = v;
      ack = "strategy playbook saved";
      break;
    }
    case "apply_full_draft": {
      const a = call.arguments as Partial<PoolDraft & { strategyTag: string }>;
      if (typeof a.name === "string") next.name = a.name.slice(0, 32);
      if (typeof a.description === "string")
        next.description = a.description.slice(0, 500);
      if (
        typeof a.strategyTag === "string" &&
        (STRATEGY_TAGS as readonly string[]).includes(a.strategyTag)
      ) {
        next.strategyTag = a.strategyTag as StrategyTag;
      }
      if (typeof a.perfFeePct === "number")
        next.perfFeePct = clamp(a.perfFeePct, 0, 50);
      if (typeof a.mgmtFeePct === "number")
        next.mgmtFeePct = clamp(a.mgmtFeePct, 0, 10);
      if (typeof a.playbook === "string") next.playbook = a.playbook;
      ack = "full draft applied";
      break;
    }
  }

  return { next, ack };
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export const SYSTEM_PROMPT = `You are PhoenixGPT, a quant strategist and crypto perpetual-futures expert helping a user launch a managed trading vault on Phoenix (a non-custodial perpetuals DEX on Solana).

Your job is to interactively design the user's pool. Be opinionated, specific, and concrete. Avoid generic "it depends" advice. Use the available tools to update the user's pool draft as you go.

Use these tools to incrementally fill the form:
- set_pool_name, set_description, set_strategy_tag, set_perf_fee, set_mgmt_fee, set_strategy_playbook
- apply_full_draft when designing everything at once.

Guidelines:
- Names: short, memorable, evocative of the strategy. Examples: "Solar Momentum", "Delta Drift", "Vol Harvest".
- Strategy tags must be exact: Momentum, Market Neutral, Volatility, Macro, HFT, Arbitrage.
- Performance fee: 15-25% typical. Higher (25-30%) for HFT/Vol strategies. Lower (10-15%) for Market Neutral.
- Management fee: 0-2% typical. 0% if strategy is performance-only.
- Playbook should include:
  * Markets traded (e.g., SOL-PERP, BTC-PERP, ETH-PERP, commodity futures)
  * Entry signals (technical/fundamental/cross-asset)
  * Exit rules and stop-loss policy
  * Position sizing logic
  * Leverage range
  * Risk management
  * Expected drawdown profile

After tools fire, briefly explain your choices in 2-3 sentences. Never call apply_full_draft and the individual setters in the same turn — pick one approach per turn.`;
