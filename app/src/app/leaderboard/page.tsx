import Link from "next/link";
import { Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getLeaderboard, listPools } from "@/lib/pools-service";
import { formatPct, formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

const METRICS = [
  { id: "pnl7d", label: "7D PnL" },
  { id: "pnl30d", label: "30D PnL" },
  { id: "aum", label: "AUM" },
] as const;

type Metric = (typeof METRICS)[number]["id"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { metric?: string };
}) {
  const metric: Metric =
    (METRICS.find((m) => m.id === searchParams.metric)?.id as Metric) ?? "pnl7d";

  const cached = await getLeaderboard(metric, 50);

  const ranked = cached.length
    ? cached.map((c, i) => ({
        rank: c.rank || i + 1,
        address: c.poolAddress,
        manager: c.manager,
        pnl7d: c.pnl7d,
        pnl30d: c.pnl30d,
        aum: c.aum,
        name: shortName(c.poolAddress),
        managerName: shortAddr(c.manager),
      }))
    : (await listPools({ limit: 50 })).map((p, i) => ({
        rank: i + 1,
        address: p.address,
        manager: p.manager,
        pnl7d: p.pnl7d,
        pnl30d: p.pnl30d,
        aum: p.aum,
        name: p.name,
        managerName: p.managerName,
      }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Leaderboard</h1>
      <p className="text-muted mb-8">Top-performing vaults and managers.</p>

      <div className="flex gap-2 mb-8">
        {METRICS.map((m) => (
          <Link
            key={m.id}
            href={`/leaderboard?metric=${m.id}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              metric === m.id
                ? "bg-accent text-white"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {m.label}
          </Link>
        ))}
      </div>

      {ranked.length === 0 ? (
        <Card className="text-center py-16 space-y-4">
          <Trophy className="h-8 w-8 mx-auto text-muted" />
          <div>
            <h2 className="text-lg font-semibold">No ranked pools yet</h2>
            <p className="text-sm text-muted mt-1 max-w-md mx-auto">
              The leaderboard fills in as pools accumulate NAV history. Launch a
              pool and start trading to appear here.
            </p>
          </div>
          <Link href="/create">
            <Button>Launch a Pool</Button>
          </Link>
        </Card>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-1 text-muted text-left">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Pool</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium text-right">AUM</th>
                <th className="px-4 py-3 font-medium text-right">7D</th>
                <th className="px-4 py-3 font-medium text-right">30D</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p) => (
                <tr
                  key={p.address}
                  className="border-b border-border hover:bg-surface-1 transition-colors"
                >
                  <td className="px-4 py-4 font-semibold text-muted">{p.rank}</td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/pool/${p.address}`}
                      className="font-medium hover:text-accent"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-muted font-mono">
                    {p.managerName}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {formatUsd(p.aum, true)}
                  </td>
                  <td
                    className={`px-4 py-4 text-right tabular-nums ${
                      p.pnl7d >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {formatPct(p.pnl7d)}
                  </td>
                  <td
                    className={`px-4 py-4 text-right tabular-nums ${
                      p.pnl30d >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {formatPct(p.pnl30d)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function shortAddr(w: string): string {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

function shortName(w: string): string {
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}
