import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EpmPoint } from "../types";
import { formatMinuteLabel } from "../utils/format";

interface EditsPerMinuteChartProps {
  series: EpmPoint[];
  edits_last_60s: number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: { value: number }[];
}

function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip-value">{payload[0].value}</span>
      <span className="chart-tooltip-label">edits at {label}</span>
    </div>
  );
}

export function EditsPerMinuteChart({ series, edits_last_60s }: EditsPerMinuteChartProps) {
  const data = series.map((p) => ({ ...p, label: formatMinuteLabel(p.minute) }));

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Edits per minute</h2>
      </div>
      <div className="stat-tile">
        <span className="stat-value">{edits_last_60s}</span>
        <span className="stat-label">edits in the last 60s</span>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="epmFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--gridline)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--baseline)" }}
            minTickGap={32}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#epmFill)"
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface-1)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
