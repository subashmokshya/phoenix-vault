"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-24">
      <Card className="space-y-4">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted">
          An error occurred while rendering this page. Details below for
          debugging.
        </p>
        <pre className="text-xs bg-surface-2 rounded-xl p-4 overflow-auto whitespace-pre-wrap break-words">
          {error.message}
          {error.digest && `\n\nDigest: ${error.digest}`}
          {error.stack && `\n\n${error.stack}`}
        </pre>
        <div className="flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="secondary" onClick={() => (window.location.href = "/")}>
            Go home
          </Button>
        </div>
      </Card>
    </div>
  );
}
