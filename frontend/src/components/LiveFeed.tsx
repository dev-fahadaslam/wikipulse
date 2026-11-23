import { useMemo } from "react";
import { ALL_WIKIS, type EditEvent } from "../types";
import { formatDelta, formatRelativeTime } from "../utils/format";

interface LiveFeedProps {
  events: EditEvent[];
  wikiFilter: string;
  maxRows?: number;
}

function WarningIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5L15 14H1L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M8 6.2v3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function filterEventsByWiki(events: EditEvent[], wikiFilter: string): EditEvent[] {
  if (wikiFilter === ALL_WIKIS) return events;
  return events.filter((e) => e.wiki === wikiFilter);
}

export function LiveFeed({ events, wikiFilter, maxRows = 40 }: LiveFeedProps) {
  const visible = useMemo(
    () => filterEventsByWiki(events, wikiFilter).slice(0, maxRows),
    [events, wikiFilter, maxRows]
  );

  return (
    <div className="panel live-feed">
      <h2>Live feed</h2>
      {visible.length === 0 ? (
        <p className="empty-state">Waiting for edits{wikiFilter !== ALL_WIKIS ? ` on ${wikiFilter}` : ""}...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Wiki</th>
              <th>Page</th>
              <th>User</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((event) => (
              <LiveFeedRow key={`${event.wiki}:${event.id}:${event.ts}`} event={event} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LiveFeedRow({ event }: { event: EditEvent }) {
  const flagged = event.vandalism?.flagged ?? false;
  return (
    <tr className={flagged ? "row-flagged" : undefined}>
      <td className="col-time">{formatRelativeTime(event.ts)}</td>
      <td className="col-wiki">
        <span className="wiki-tag">{event.wiki}</span>
      </td>
      <td className="col-title">
        {event.url ? (
          <a href={event.url} target="_blank" rel="noreferrer">
            {event.title}
          </a>
        ) : (
          event.title
        )}
        {event.bot && <span className="tag tag-bot">bot</span>}
        {event.change_type === "new" && <span className="tag tag-new">new</span>}
        {flagged && (
          <span className="tag tag-vandalism" title={event.vandalism?.reason ?? undefined}>
            <WarningIcon />
            possible vandalism
            {event.vandalism?.source === "ai" ? " (AI)" : ""}
          </span>
        )}
      </td>
      <td className="col-user">{event.user}</td>
      <td className={event.delta < 0 ? "col-delta negative" : "col-delta positive"}>
        {formatDelta(event.delta)}
      </td>
    </tr>
  );
}
