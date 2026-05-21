"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  setGroqKey,
  clearGroqKey,
  isLikelyGroqKey,
} from "@/lib/ai/key-store";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (key: string) => void;
  current: string | null;
};

export function GroqKeyModal({ open, onClose, onSaved, current }: Props) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function save() {
    const v = value.trim();
    if (!isLikelyGroqKey(v)) {
      setError("That doesn't look like a Groq key (should start with gsk_)");
      return;
    }
    setGroqKey(v);
    onSaved(v);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-1 p-6 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Connect your AI brain</h2>
        <p className="text-sm text-muted mb-4 leading-relaxed">
          Bring your own free Groq API key. We use{" "}
          <span className="text-foreground font-medium">Llama 3.3 70B</span> via
          Groq — 30 requests/min on the free tier. Your key never leaves this
          browser.
        </p>

        <label className="text-xs uppercase tracking-wider text-muted">
          Groq API Key
        </label>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="gsk_..."
          className={cn(
            "w-full mt-2 h-11 px-4 rounded-xl bg-surface-2 border focus:outline-none focus:ring-2",
            error
              ? "border-negative focus:ring-negative/40"
              : "border-border focus:ring-accent/40"
          )}
        />
        {error && <p className="text-xs text-negative mt-2">{error}</p>}

        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-accent hover:underline mt-3"
        >
          Get a free Groq key →
        </a>

        <div className="flex gap-2 mt-6">
          <Button className="flex-1" onClick={save} disabled={!value.trim()}>
            Save key
          </Button>
          {current && (
            <Button
              variant="danger"
              onClick={() => {
                clearGroqKey();
                setValue("");
                onSaved("");
                onClose();
              }}
            >
              Clear
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>

        <p className="text-[10px] text-muted text-center mt-4 leading-relaxed">
          Stored in localStorage. Requests go directly from your browser to
          api.groq.com — Phoenix Vault servers never see it.
        </p>
      </div>
    </div>
  );
}
