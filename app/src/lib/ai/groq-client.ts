"use client";

import { GROQ_TOOLS, SYSTEM_PROMPT, type ToolCall } from "./strategy-tools";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }
  | { role: "system"; content: string };

type GroqToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AssistantTurn = {
  message: string;
  toolCalls: { id: string; call: ToolCall }[];
  raw: ChatMessage;
};

export class GroqError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function runAssistantTurn(params: {
  apiKey: string;
  history: ChatMessage[];
}): Promise<AssistantTurn> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...params.history,
  ];

  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: GROQ_TOOLS,
      tool_choice: "auto",
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message ?? "";
    } catch {
      // ignore
    }
    throw new GroqError(
      `Groq API ${res.status}${detail ? ` — ${detail}` : ""}`,
      res.status
    );
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  const msg = choice?.message ?? {};
  const content: string = msg.content ?? "";
  const rawToolCalls: GroqToolCall[] = msg.tool_calls ?? [];

  const toolCalls = rawToolCalls.map((tc) => ({
    id: tc.id,
    call: {
      name: tc.function.name as ToolCall["name"],
      arguments: safeParseJson(tc.function.arguments),
    } as ToolCall,
  }));

  return {
    message: content,
    toolCalls,
    raw: {
      role: "assistant",
      content,
      tool_calls: rawToolCalls.length ? rawToolCalls : undefined,
    },
  };
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
