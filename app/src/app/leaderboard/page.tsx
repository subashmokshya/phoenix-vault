import Link from "next/link";
import { DEMO_POOLS } from "@/lib/mock-data";
import { formatPct, formatUsd } from "@/lib/utils";

const METRICS = [
  { id: "pnl7d", label: "7D PnL", key: "pnl7d" as const },
  { id: "pnl30d", label: "30D PnL", key: "pnl30d" as const },
  { id: "aum", label: "AUM", key: "aum" as const },
];

export default function LeaderboardPage({
  searchParams,
}: {
  searchParams: { metric?: string };
}) {
  const metric = searchParams.metric ?? "pnl7d";
  const key = METRICS.find((m) => m.id === metric)?.key ?? "pnl7d";

  const ranked = [...DEMO_POOLS]
    .sort((a, b) => (b[key] as number) - (a[key] as number))
    .map((p, i) => ({ ...p, rank: i + 1 }));

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
                <td className="px-4 py-4 text-muted">{p.managerName}</td>
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
    </div>
  );
}
