"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Send, Sparkles, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroqKeyModal } from "./groq-key-modal";
import { getGroqKey } from "@/lib/ai/key-store";
import {
  runAssistantTurn,
  type ChatMessage,
  GroqError,
} from "@/lib/ai/groq-client";
import {
  applyToolCall,
  type PoolDraft,
  type ToolCall,
} from "@/lib/ai/strategy-tools";
import { cn } from "@/lib/utils";

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  tools?: { name: string; ack: string }[];
};

const STARTERS = [
  "Design a SOL momentum vault with tight stops",
  "Build a delta-neutral funding-rate vault",
  "I want a low-vol BTC/ETH market-neutral strategy",
  "Surprise me with a high-Sharpe arbitrage idea",
];

type Props = {
  draft: PoolDraft;
  onDraftChange: (next: PoolDraft) => void;
};

export function AiStrategyPanel({ draft, onDraftChange }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const draftSummary = useMemo(
    () =>
      `Current draft: name="${draft.name}" tag=${draft.strategyTag} perfFee=${draft.perfFeePct}% mgmtFee=${draft.mgmtFeePct}% playbookLen=${draft.playbook.length}`,
    [draft]
  );

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
      setError(null);
      setBusy(true);

      const nextHistory: ChatMessage[] = [
        ...history,
        { role: "user", content: `${text}\n\n(${draftSummary})` },
      ];

      try {
        const turn = await runAssistantTurn({ apiKey, history: nextHistory });

        let workingDraft = draft;
        const acks: { name: string; ack: string }[] = [];

        for (const tc of turn.toolCalls) {
          const result = applyToolCall(workingDraft, tc.call as ToolCall);
          workingDraft = result.next;
          acks.push({ name: tc.call.name, ack: result.ack });
        }

        if (acks.length) onDraftChange(workingDraft);

        const assistantMsg: UiMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: turn.message || (acks.length ? "Updated your draft." : ""),
          tools: acks,
        };
        setMessages((m) => [...m, assistantMsg]);

        const toolMessages: ChatMessage[] = turn.toolCalls.map((tc, i) => ({
          role: "tool",
          tool_call_id: tc.id,
          content: acks[i]?.ack ?? "ok",
        }));

        setHistory([...nextHistory, turn.raw, ...toolMessages]);
      } catch (e) {
        const msg =
          e instanceof GroqError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Unknown error";
        setError(msg);
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
    [apiKey, busy, history, draft, draftSummary, onDraftChange]
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
              <h3 className="font-semibold text-sm">PhoenixGPT</h3>
              <p className="text-[11px] text-muted">
                Llama 3.3 70B · Groq · 30 req/min free
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
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
        >
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted leading-relaxed">
                Tell PhoenixGPT what kind of vault you want to launch. It will
                design the strategy, write the playbook, set the fees, and fill
                the form for you.
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
                {m.tools && m.tools.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                    {m.tools.map((t, i) => (
                      <div
                        key={i}
                        className="text-xs text-accent flex items-start gap-2"
                      >
                        <span className="font-mono">→</span>
                        <span>{t.ack}</span>
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

        {error && !busy && (
          <div className="px-5 py-2 text-xs text-negative border-t border-border">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex gap-2 p-3 border-t border-border bg-surface-1"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={apiKey ? "Ask PhoenixGPT…" : "Add your Groq key to start"}
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
