"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

export function Sparkline({
  data,
  positive = true,
  height = 40,
}: {
  data: { nav: number }[];
  positive?: boolean;
  height?: number;
}) {
  if (!data.length) return null;
  const color = positive ? "#00D395" : "#FF5000";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="nav"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
