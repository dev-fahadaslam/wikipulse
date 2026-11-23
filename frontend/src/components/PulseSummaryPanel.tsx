import type { PulseSummary } from "../types";
import { formatRelativeTime } from "../utils/format";

interface PulseSummaryPanelProps {
  pulse: PulseSummary | null;
}

export function PulseSummaryPanel({ pulse }: PulseSummaryPanelProps) {
  return (
    <div className="panel pulse-panel">
      <div className="panel-header">
        <h2>Pulse summary</h2>
        {pulse && (
          <span className={`pill pill-${pulse.source}`}>
            {pulse.source === "ai" ? "AI" : "heuristic"}
          </span>
        )}
      </div>
      {pulse ? (
        <>
          <p className="pulse-text">{pulse.summary}</p>
          <p className="pulse-meta">updated {formatRelativeTime(pulse.generated_at)}</p>
        </>
      ) : (
        <p className="empty-state">Waiting for enough activity to summarize...</p>
      )}
    </div>
  );
}
