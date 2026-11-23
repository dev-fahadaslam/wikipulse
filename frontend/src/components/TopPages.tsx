import type { TopPage } from "../types";

interface TopPagesProps {
  pages: TopPage[];
  showWikiColumn: boolean;
}

export function TopPages({ pages, showWikiColumn }: TopPagesProps) {
  return (
    <div className="panel">
      <h2>Top 10 pages (last 5 min)</h2>
      {pages.length === 0 ? (
        <p className="empty-state">No repeated edits yet.</p>
      ) : (
        <ol className="top-pages">
          {pages.map((p, i) => (
            <li key={`${p.wiki}:${p.title}:${i}`}>
              <span className="rank">{i + 1}</span>
              <span className="title">
                {p.title}
                {showWikiColumn && <span className="wiki-tag">{p.wiki}</span>}
              </span>
              <span className="count">{p.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
