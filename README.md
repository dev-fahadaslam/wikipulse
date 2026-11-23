# WikiPulse

A live dashboard over Wikipedia's recent-changes firehose: edits per minute,
the top 10 most-edited pages in the last 5 minutes, a live edit feed
filterable by wiki, an AI-generated "what's trending right now" summary, and
AI-assisted vandalism flagging.

## Architecture

```
Wikimedia SSE stream  --->  FastAPI backend                --->  WebSocket  --->  React + TS dashboard
(or sample_events.jsonl)     - stream_client.py (ingest)          (one topic,
                              - models.py (parse/normalize)        several message
                              - vandalism.py (heuristic score)     types -- see
                              - ai.py (LLM: pulse + 2nd-pass        below)
                                vandalism judgement)
                              - stats.py (rolling windows)
                              - main.py (orchestration, WS)
```

The backend holds all state in memory (a few bounded deques/counters per
wiki) -- there's no database. Restarting the process starts the rolling
windows over, which is the right trade-off for a "what's happening right
now" view; nothing here needs to survive a restart.

### Why FastAPI + WebSocket

FastAPI gives async I/O (needed to stream the SSE firehose and serve many
WebSocket clients concurrently) with very little boilerplate. A single
WebSocket topic carries three message shapes (`edit`, `stats`, `pulse`,
plus an `init` snapshot on connect and `vandalism_update` corrections) --
SSE would have worked too, but WebSocket keeps the door open for the
dashboard to eventually send something back (e.g. adjusting the vandalism
threshold) without switching transports.

### Stats, computed once, filtered by the client

The backend keeps a 15-minute timestamp window (for the edits/min sparkline)
and a 5-minute `(wiki, title)` window (for top pages), both globally and
per-wiki, and recomputes a snapshot every 2 seconds. The dropdown's "filter
by wiki" just selects which pre-computed bucket (`overall` or
`by_wiki[code]`) the frontend reads -- the backend doesn't repeat the
aggregation per connected client, and the frontend doesn't need its own
copy of the aggregation logic. Only the top `MAX_TRACKED_WIKIS` (20 by
default) wikis by recent volume get a per-wiki breakdown, since a given
2-second window on the real firehose can touch 100+ distinct wikis and most
of them have 1-2 edits -- not worth a dropdown entry.

### Vandalism: heuristic first, LLM only for the borderline cases

Every edit is scored by a free, local heuristic (`app/vandalism.py`):
large blanking/deletion, an unusually large insertion, no edit summary on a
big change, profanity/shouting in the summary, a brand-new near-empty page,
an IP-looking username. Edits are broadcast immediately with that verdict.

Only edits whose heuristic score crosses `VANDALISM_LLM_THRESHOLD` (0.5 by
default) are *also* sent to the LLM in the background for a second opinion
and a short human-readable reason; the result arrives a moment later as a
`vandalism_update` message that patches the row in place. This was a
deliberate cost/latency trade-off given the brief's note about a spending
limit: calling an LLM on every single edit in a ~10-20 edits/sec firehose
would be both slow (blocking ingestion while waiting on a round trip) and
needlessly expensive, when a cheap heuristic already rules out the vast
majority of edits as obviously fine.

### Frontend state: Context + `useReducer`, not component state

`frontend/src/store/` holds a small central store: `wikiPulseReducer.ts` is
a pure function (`(state, action) -> state`) handling the same five
message shapes as the backend, and `WikiPulseContext.tsx` is the only place
that owns the WebSocket connection, `dispatch`-ing an action per message.
Every component reads from it with one hook, `useWikiPulse()`, instead of
the socket being wired into whichever component happens to need it.

This is deliberately the same shape a Redux-style store would have
(`dispatch(action) -> reducer -> new state`) using only what React ships
with -- no extra dependency for a single-page dashboard this size, but a
straightforward swap to Redux/Zustand later if the app grows multiple
independent stores or needs middleware (logging, persistence, etc). The
reducer being a pure function is what makes `wikiPulseReducer.test.ts`
possible without mounting React or opening a real socket: every message
type is tested as a plain `(state, action) -> state` assertion.

One thing that deliberately stays *out* of the store: the live feed's
"filter by wiki" selection, which lives as local `useState` in
`Dashboard.tsx`. It's a per-view UI choice, not server data shared across
components, so it doesn't belong in the central store.

### Pulse summary

Every `PULSE_INTERVAL_SECONDS` (45s default), the backend hands the LLM a
compact digest of the current top pages and edit rate and asks for 2-3
plain-English sentences. If no API key is configured, or the call fails,
a templated fallback sentence is generated from the same stats instead, so
the panel is never empty and a flaky/absent API key never breaks the app.

## Running it

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add ANTHROPIC_API_KEY to enable real AI features
uvicorn app.main:app --reload
```

Runs on `http://localhost:8000`, WebSocket at `ws://localhost:8000/ws`.

Set `EVENT_SOURCE=sample` (in `.env` or the environment) to replay the
bundled `sample_events.jsonl` instead of hitting the live Wikimedia stream
-- useful offline, in CI, or for a deterministic demo.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173` and connects to the backend above. Set
`VITE_WS_URL` if the backend isn't on the default host/port.

### Docker Compose

```bash
ANTHROPIC_API_KEY=sk-... docker compose up --build
```

Backend on `:8000`, frontend on `:3000`. Defaults to `EVENT_SOURCE=live`;
override with `EVENT_SOURCE=sample` for an offline demo.

### Tests

```bash
cd backend && pytest
cd frontend && npm test
```

See `e2e/README.md` for the optional Playwright end-to-end test.

## WebSocket message schema

Every message is `{"type": ..., "data": ...}`.

| type | when | data |
|---|---|---|
| `init` | once, right after connecting | `{stats: StatsSnapshot, pulse: PulseSummary \| null}` |
| `edit` | per accepted edit/new event | normalized edit, incl. a heuristic `vandalism` verdict |
| `stats` | every 2s | `StatsSnapshot` (`overall` + `by_wiki` buckets, each with `epm_series`, `edits_last_60s`, `top_pages`) |
| `pulse` | every ~45s | `{summary, generated_at, source: "ai" \| "fallback"}` |
| `vandalism_update` | when an LLM second-pass resolves | `{id, wiki, vandalism}` -- patches a row already in the feed |

`log` and `categorize` stream entries are dropped at parse time (`EditEvent.from_raw`
returns `None`); only `edit` and `new` are dashboard-relevant.

## Decisions and assumptions

- **Only `edit`/`new` recentchange events are shown.** The stream also carries
  `log` (blocks, protections, etc.) and `categorize` entries, which aren't
  "edits" in the sense the brief asks for.
- **"Wiki" = Wikimedia's own database code** (`enwiki`, `dewiki`,
  `commonswiki`, ...), matching the raw stream's `wiki` field directly,
  rather than inventing a separate "project" grouping.
- **Bot edits are never vandalism-flagged.** Bot accounts on Wikimedia
  projects are a separate, already-reviewed category of automated edit;
  flagging them would mostly produce noise.
- **The live feed is capped (150 events client-side, 40 rows rendered)**
  rather than virtualized, since a dashboard about "right now" doesn't need
  a deep scrollback.
- **No persistence/database.** Everything is in-memory and resets on
  restart; this is a live-activity view, not a historical archive.
- **`sample_events.jsonl` is the file supplied with the assignment.** It
  turned out to include at least two deliberately planted edge cases --
  one malformed JSON line and one real `edit` event with `wiki: null`
  (only `server_name` set) -- both of which now have dedicated tests
  (`tests/test_stream_client.py::test_iter_sample_events_skips_malformed_lines`,
  `tests/test_models.py::test_from_raw_falls_back_to_server_name_when_wiki_is_missing`).
- **Rolling-window pruning assumes roughly chronological arrival.** Both
  the edits/min window and the top-pages window only ever pop expired
  entries off the *front* of a deque, which is O(1) amortized but relies on
  events arriving in non-decreasing timestamp order. True for the real SSE
  stream (events are pushed as they happen); a wildly out-of-order
  timestamp would linger past its window until enough newer entries ahead
  of it also expire. Noted in `app/stats.py`.

## What I'd do with more time

- Persist a short rolling history (e.g. Redis or SQLite) so a backend
  restart, or a second backend instance behind a load balancer, doesn't
  lose the current window -- right now stats live in one process's memory.
- Surface the heuristic reason inline in the live feed even when no LLM
  pass runs (currently only the tooltip shows it); add a small vandalism
  activity counter to the header.
- Batch multiple candidate edits into a single LLM call instead of one
  call per escalated edit, to cut latency and cost further under load.
- Add backpressure/sampling on the WebSocket broadcast for extremely busy
  periods (the firehose can briefly spike well above what a browser tab
  should render row-by-row).
- Expand the e2e suite beyond the one happy-path spec (vandalism badge
  appearing, reconnect-after-drop behavior).

## AI usage

See `AI_LOG.md`.
