import { useState } from "react";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { EditsPerMinuteChart } from "./components/EditsPerMinuteChart";
import { LiveFeed } from "./components/LiveFeed";
import { PulseSummaryPanel } from "./components/PulseSummaryPanel";
import { TopPages } from "./components/TopPages";
import { WikiFilter } from "./components/WikiFilter";
import { useWikiPulse } from "./store/WikiPulseContext";
import { ALL_WIKIS } from "./types";

export function Dashboard() {
  const { status, feed, stats, pulse } = useWikiPulse();
  // Which wiki to display is a purely local UI concern (not server data),
  // so it stays as component state rather than living in the shared store.
  const [wikiFilter, setWikiFilter] = useState<string>(ALL_WIKIS);

  const bucket =
    wikiFilter === ALL_WIKIS ? stats?.overall : stats?.by_wiki[wikiFilter] ?? stats?.overall;

  return (
    <div className="app">
      <header className="app-header">
        <h1>WikiPulse</h1>
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
