import type { ConnectionStatus } from "../store/WikiPulseContext";

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const label = status === "open" ? "live" : status === "connecting" ? "connecting..." : "disconnected";
  return (
    <span className={`connection-badge connection-${status}`}>
      <span className="connection-dot" />
      {label}
    </span>
  );
}
