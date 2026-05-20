"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

export function PnlChart({
  data,
  positive = true,
}: {
  data: { ts: string; nav: number }[];
  positive?: boolean;
}) {
  const color = positive ? "#00D395" : "#FF5000";
  const gradientId = positive ? "pnlUp" : "pnlDown";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="ts"
          tickFormatter={(v) => format(new Date(v), "MMM d")}
          stroke="#555"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={["auto", "auto"]}
          tickFormatter={(v) => v.toFixed(2)}
          stroke="#555"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: 12,
            fontSize: 13,
          }}
          labelFormatter={(v) => format(new Date(v as string), "MMM d, yyyy")}
          formatter={(v) => [Number(v ?? 0).toFixed(4), "NAV"]}
        />
        <Area
          type="monotone"
          dataKey="nav"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
