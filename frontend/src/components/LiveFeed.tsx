import { useMemo, useState } from "react";
import { ALL_WIKIS, type EditEvent } from "../types";
import { formatDelta, formatRelativeTime } from "../utils/format";

interface LiveFeedProps {
  events: EditEvent[];
  wikiFilter: string;
}

export interface LiveFeedTextFilters {
  search: string;
  hideBots: boolean;
  flaggedOnly: boolean;
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

/** Search/bot/flagged filters, applied after the wiki filter. Exported as a
 * pure function so the matching rules are unit testable without mounting
 * the component or wiring up checkbox events.
 */
export function applyLiveFeedTextFilters(
  events: EditEvent[],
  filters: LiveFeedTextFilters
): EditEvent[] {
  const term = filters.search.trim().toLowerCase();
  return events.filter((event) => {
    if (filters.hideBots && event.bot) return false;
    if (filters.flaggedOnly && !event.vandalism?.flagged) return false;
    if (
      term &&
      !event.title.toLowerCase().includes(term) &&
      !event.user.toLowerCase().includes(term)
    ) {
      return false;
    }
    return true;
  });
}

export function LiveFeed({ events, wikiFilter }: LiveFeedProps) {
  // A live feed moving several times a second is unreadable without a way
  // to freeze it. Pausing snapshots the (pre-wiki-filter) events so the
  // wiki/search/bot/flagged filters still work on the frozen view; the
  // store keeps updating underneath, and resuming just jumps to current.
  const [paused, setPaused] = useState(false);
  const [frozenEvents, setFrozenEvents] = useState<EditEvent[] | null>(null);
  const [search, setSearch] = useState("");
  const [hideBots, setHideBots] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const togglePause = () => {
    if (paused) {
      setFrozenEvents(null);
      setPaused(false);
    } else {
      setFrozenEvents(events);
      setPaused(true);
    }
  };

  const sourceEvents = paused && frozenEvents ? frozenEvents : events;

  const byWiki = useMemo(
    () => filterEventsByWiki(sourceEvents, wikiFilter),
    [sourceEvents, wikiFilter]
  );
  const visible = useMemo(
    () => applyLiveFeedTextFilters(byWiki, { search, hideBots, flaggedOnly }),
    [byWiki, search, hideBots, flaggedOnly]
  );

  const hasAnyEvents = byWiki.length > 0;
  const hasFiltersApplied = search.trim() !== "" || hideBots || flaggedOnly;

  return (
    <div className="panel live-feed-panel">
      <div className="panel-header">
        <h2>Live feed</h2>
        <span className="live-feed-count">
          {hasFiltersApplied ? `${visible.length} of ${byWiki.length}` : byWiki.length}
        </span>
      </div>

      <div className="live-feed-toolbar">
        <input
          type="search"
          className="live-feed-search"
          placeholder="Search title or user..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search live feed by title or user"
        />
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={hideBots}
            onChange={(e) => setHideBots(e.target.checked)}
          />
          Hide bots
        </label>
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
          />
          Flagged only
        </label>
        <button
          type="button"
          className={paused ? "pause-button paused" : "pause-button"}
          onClick={togglePause}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      <div className="live-feed">
        {visible.length === 0 ? (
          <p className="empty-state">
            {!hasAnyEvents
              ? `Waiting for edits${wikiFilter !== ALL_WIKIS ? ` on ${wikiFilter}` : ""}...`
              : "No edits match these filters."}
          </p>
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
