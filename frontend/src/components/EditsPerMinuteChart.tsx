import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EpmPoint } from "../types";
import { formatMinuteLabel } from "../utils/format";

interface EditsPerMinuteChartProps {
  series: EpmPoint[];
  edits_last_60s: number;
}

export function EditsPerMinuteChart({ series, edits_last_60s }: EditsPerMinuteChartProps) {
  const data = series.map((p) => ({ ...p, label: formatMinuteLabel(p.minute) }));

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Edits per minute</h2>
        <span className="headline-metric">{edits_last_60s} in last 60s</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
          <Tooltip
            labelFormatter={(label) => `at ${label}`}
            formatter={(value: number) => [value, "edits"]}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
