import { useState } from "react";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { EditsPerMinuteChart } from "./components/EditsPerMinuteChart";
import { LiveFeed } from "./components/LiveFeed";
import { PulseSummaryPanel } from "./components/PulseSummaryPanel";
import { TopPages } from "./components/TopPages";
import { WikiFilter } from "./components/WikiFilter";
import { selectStatsBucket } from "./store/selectors";
import { useWikiPulse } from "./store/WikiPulseContext";
import { ALL_WIKIS } from "./types";

export function Dashboard() {
  const { status, feed, stats, pulse } = useWikiPulse();
  // Which wiki to display is a purely local UI concern (not server data),
  // so it stays as component state rather than living in the shared store.
  const [wikiFilter, setWikiFilter] = useState<string>(ALL_WIKIS);

  const bucket = selectStatsBucket(stats, wikiFilter);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
              <path
                d="M4 12.5h3.4l1.6-4.5 2.6 9 2-7.5 1.4 3h4.8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </span>
          <div>
            <h1>WikiPulse</h1>
            <p className="brand-subtitle">Live Wikipedia edit activity</p>
          </div>
        </div>
        <div className="header-controls">
          <WikiFilter wikis={stats?.wikis ?? []} value={wikiFilter} onChange={setWikiFilter} />
          <ConnectionBadge status={status} />
        </div>
      </header>

      <main className="app-grid">
        <div className="grid-area-pulse">
          <PulseSummaryPanel pulse={pulse} />
        </div>
        <div className="grid-area-chart">
          <EditsPerMinuteChart
            series={bucket?.epm_series ?? []}
            edits_last_60s={bucket?.edits_last_60s ?? 0}
          />
        </div>
        <div className="grid-area-top-pages">
          <TopPages pages={bucket?.top_pages ?? []} showWikiColumn={wikiFilter === ALL_WIKIS} />
        </div>
        <div className="grid-area-feed">
          <LiveFeed events={feed} wikiFilter={wikiFilter} />
        </div>
      </main>
    </div>
  );
}
