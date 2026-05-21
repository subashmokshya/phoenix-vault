"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { KeyRound, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroqKeyModal } from "@/components/ai/groq-key-modal";
import { getGroqKey } from "@/lib/ai/key-store";
import {
  runAssistantTurn,
  type ChatMessage,
  GroqError,
} from "@/lib/ai/groq-client";
import {
  STRATEGY_OPS_TOOLS,
  applyOpsToolCall,
  buildOpsSystemPrompt,
  type ProposedTrade,
  type StrategyOpsToolCall,
  type StrategySpec,
} from "@/lib/ai/strategy-ops-tools";
import type { LivePositionDTO, LiveTradeDTO } from "@/hooks/use-phoenix-live";
import { cn } from "@/lib/utils";

const STARTERS = [
  "What's my current risk exposure?",
  "Suggest a trade based on recent fills",
  "Tighten the stops and lower max position",
  "Pause if the regime looks unfavorable",
];

type Props = {
  poolName: string;
  strategyTag: string;
  spec: StrategySpec;
  onSpecChange: (next: StrategySpec) => void;
  onPropose: (t: ProposedTrade) => void;
  positions: LivePositionDTO[];
  recentTrades: LiveTradeDTO[];
};

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  acks?: string[];
};

export function StrategyCopilot({
  poolName,
  strategyTag,
  spec,
  onSpecChange,
  onPropose,
  positions,
  recentTrades,
}: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getGroqKey();
    setApiKey(stored);
    if (!stored) setModalOpen(true);
  }, []);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, busy]);

  const systemPrompt = useMemo(
    () => buildOpsSystemPrompt({ poolName, strategyTag, spec }),
    [poolName, strategyTag, spec]
  );

  const contextSummary = useMemo(() => {
    const posSummary =
      positions.length === 0
        ? "No open positions."
        : positions
            .map(
              (p) =>
                `${p.market} ${p.side} ${p.baseQty.toFixed(3)} @ $${p.entryPrice.toFixed(2)} mark $${p.markPrice.toFixed(2)} uPnL $${p.unrealizedPnl.toFixed(2)}`
            )
            .join("; ");
    const tradeSummary =
      recentTrades.length === 0
        ? "No recent fills."
        : recentTrades
            .slice(0, 5)
            .map(
              (t) =>
                `${new Date(t.ts).toLocaleTimeString()} ${t.side} ${t.market} ${t.qty.toFixed(2)} @ $${t.price.toFixed(2)} rPnL ${t.realizedPnl.toFixed(2)}`
            )
            .join("; ");
    return `Live context:\nPositions: ${posSummary}\nLast fills: ${tradeSummary}`;
  }, [positions, recentTrades]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      if (!apiKey) {
        setModalOpen(true);
        return;
      }

      const userMsg: UiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text,
      };
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setBusy(true);

      const nextHistory: ChatMessage[] = [
        ...history,
        { role: "user", content: `${text}\n\n${contextSummary}` },
      ];

      try {
        const turn = await runAssistantTurn({
          apiKey,
          history: nextHistory,
          systemPrompt,
          tools: STRATEGY_OPS_TOOLS,
        });

        let workingSpec = spec;
        const acks: string[] = [];

        for (const tc of turn.toolCalls) {
          const result = applyOpsToolCall(
            workingSpec,
            tc.call as unknown as StrategyOpsToolCall
          );
          workingSpec = result.next;
          acks.push(result.ack);
          if (result.proposedTrade) onPropose(result.proposedTrade);
        }

        if (acks.length) onSpecChange(workingSpec);

        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text:
              turn.message ||
              (acks.length ? "Strategy updated." : "Standing by."),
            acks,
          },
        ]);

        const toolMessages: ChatMessage[] = turn.toolCalls.map((tc, i) => ({
          role: "tool",
          tool_call_id: tc.id,
          content: acks[i] ?? "ok",
        }));

        setHistory([...nextHistory, turn.raw, ...toolMessages]);
      } catch (e) {
        const msg =
          e instanceof GroqError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Unknown error";
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: `⚠ ${msg}`,
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [
      apiKey,
      busy,
      history,
      spec,
      systemPrompt,
      contextSummary,
      onPropose,
      onSpecChange,
    ]
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      <div className="flex flex-col h-full rounded-2xl border border-border bg-surface-1 overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-accent/15 text-accent flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">StrategyOps</h3>
              <p className="text-[11px] text-muted">
                Live AI co-pilot · Llama 3.3 70B · Groq
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {apiKey ? "Key set" : "Add key"}
          </button>
        </header>

        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0"
        >
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted leading-relaxed">
                I have live access to your strategy spec, open positions, and
                recent fills. Ask me to adjust risk, change rules, pause, or
                propose specific trades.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-sm rounded-xl border border-border bg-surface-2 hover:bg-surface-3 hover:border-accent/40 px-4 py-3 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-accent text-white"
                    : "bg-surface-2 border border-border"
                )}
              >
                {m.text}
                {m.acks && m.acks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                    {m.acks.map((a, i) => (
                      <div
                        key={i}
                        className="text-xs text-accent flex items-start gap-2"
                      >
                        <span className="font-mono">→</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="bg-surface-2 border border-border rounded-2xl px-4 py-3 text-sm">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
                    style={{ animationDelay: "300ms" }}
                  />
                </span>
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex gap-2 p-3 border-t border-border bg-surface-1"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={apiKey ? "Ask StrategyOps…" : "Add your Groq key to start"}
            className="flex-1 h-11 px-4 rounded-xl bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent/40 text-sm"
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <GroqKeyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(k) => setApiKey(k || null)}
        current={apiKey}
      />
    </>
  );
}
