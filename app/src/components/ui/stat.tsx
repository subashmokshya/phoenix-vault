import { cn, formatPct, formatUsd } from "@/lib/utils";

export function Stat({
  label,
  value,
  suffix,
  change,
  className,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  change?: number;
  className?: string;
}) {
  const isPositive = change !== undefined && change >= 0;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {typeof value === "number" && suffix === "$"
          ? formatUsd(value, true)
          : value}
        {suffix && suffix !== "$" && (
          <span className="text-lg text-muted ml-1">{suffix}</span>
        )}
      </span>
      {change !== undefined && (
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            isPositive ? "text-positive" : "text-negative"
          )}
        >
          {formatPct(change)}
        </span>
      )}
    </div>
  );
}
