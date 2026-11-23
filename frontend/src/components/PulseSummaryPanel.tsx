import type { PulseSummary } from "../types";
import { formatRelativeTime } from "../utils/format";

interface PulseSummaryPanelProps {
  pulse: PulseSummary | null;
}

function SparkleIcon() {
  return (
    <svg className="pulse-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5l1.2 3.7 3.7 1.2-3.7 1.2L8 11.3l-1.2-3.7-3.7-1.2 3.7-1.2L8 1.5z"
        fill="currentColor"
      />
      <path d="M13 10.5l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z" fill="currentColor" />
    </svg>
  );
}

export function PulseSummaryPanel({ pulse }: PulseSummaryPanelProps) {
  return (
    <div className="panel pulse-panel">
      <div className="panel-header">
        <h2>
          <SparkleIcon />
          Pulse summary
        </h2>
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
        <div className="pulse-loading">
          <span className="pulse-loading-bar" />
          <span className="pulse-loading-bar short" />
          <p className="empty-state">Waiting for enough activity to summarize...</p>
        </div>
      )}
    </div>
  );
}
