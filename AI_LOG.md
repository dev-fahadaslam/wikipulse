# AI_LOG

This project was built with Claude Code (Anthropic's CLI agent) as a pairing
partner for essentially the entire implementation -- backend, frontend,
tests, and this log itself. Below are the decisions worth calling out:
what was asked for, what got kept as-is, what got changed or rejected, and
one clear case where the AI's first draft was wrong.

## 1. WebSocket message schema, designed before any code

**Asked:** to settle the exact WebSocket contract (message types and
payload shapes) before writing the FastAPI app or the React hook, so
backend and frontend wouldn't drift out of sync mid-build.

**Kept:** the final five-message design (`init`, `edit`, `stats`, `pulse`,
`vandalism_update`) documented in `README.md`, with one shared aggregation
computed server-side and `by_wiki` keyed buckets so the frontend's "filter
by wiki" dropdown is just a lookup, not a recomputation.

**Rejected:** an earlier instinct to give each dashboard feature (chart,
top pages, live feed) its own SSE endpoint. Multiple connections would have
meant multiple reconnect/backoff implementations on the frontend for no
real benefit -- one WebSocket with typed messages was simpler end to end.

## 2. Vandalism detection: heuristic-first, LLM only on escalation

**Asked:** how to flag vandalism "with a short reason" using an LLM,
given the brief explicitly mentions the API key has a spending limit.

**Kept:** a free local heuristic (`app/vandalism.py`) that scores every
edit instantly (blanking, huge insertion, abusive edit summary, etc.), with
only the edits that cross a threshold also sent to the LLM in the
background for a second opinion and a human-readable reason.

**Changed:** the first framing considered was "send every edit's comment
and byte-delta to the LLM for a verdict," which is simpler code but would
mean one API call per edit against a ~10-20 edits/sec firehose -- both slow
(network round trip blocking ingestion) and the fastest way to blow through
a capped budget. Moved the LLM call off the hot path (`asyncio.create_task`,
broadcast a correction later) once this was raised.

## 3. Rolling stats: timestamps vs. pre-bucketed counts

**Asked:** to implement "edits per minute" and "edits in the last 60
seconds" efficiently without unbounded memory growth.

**Changed:** the first draft kept only per-minute counters (a
`dict[minute] -> count`), which is compact but makes "edits in the last
60 seconds" inaccurate right at a minute boundary (it would jump depending
on which 60-second window you sampled, not slide smoothly). Switched to
storing raw event timestamps in a pruned deque per key, computing the
minute-bucket sparkline from that deque on each snapshot, and computing the
60-second headline number as an exact `count(ts >= now - 60)` over the same
data -- one data structure instead of two, and correct at every point in
time rather than only at minute boundaries.

## 4. A real AI mistake: sample replay used the wrong clock

**What happened:** while writing `_iter_sample_events` in `stream_client.py`
(replays `sample_events.jsonl` for offline use), the first version stamped
each replayed event with `asyncio.get_event_loop().time()`. That's a
monotonic clock with an arbitrary, implementation-defined epoch -- not wall
time. Every other part of the system (`stats.py`'s window pruning, the
"edits in the last N minutes" logic) compares timestamps against
`time.time()`-based cutoffs. Shipping that as-is would have made every
replayed sample event look like it happened at some unrelated point
relative to "now" (often far in the past, sometimes in the future
depending on process uptime), which would have silently emptied every
rolling window: `EVENT_SOURCE=sample` -- the offline/demo/CI path --
would have rendered a permanently blank dashboard with no error raised
anywhere.

**Caught by:** re-reading the file right after writing it, before running
anything, specifically because "what clock does this timestamp come from"
is exactly the kind of mismatch that doesn't show up as a type error or an
exception -- it just produces quietly wrong runtime behavior. Fixed by
using `time.time()` instead, with a regression test
(`test_iter_sample_events_replays_recorded_file` and friends in
`tests/test_stream_client.py`) that exercises the generator directly.

## 5. Dependency pinning fought the local Python version

**What happened:** `requirements.txt` was first written with specific
pinned versions (`fastapi==0.118.0`, etc.) from general knowledge of
current-ish releases. Installing them on this machine (Python 3.14, a very
recent release) triggered a from-source build of at least one transitive
dependency because no prebuilt wheel existed yet for that exact pinned
version on `cp314` -- the install sat there compiling instead of just
downloading.

**Changed:** relaxed the pins to `>=` lower bounds so pip resolves the
newest published release of each package, which already has `cp314`
wheels. Documented in `README.md` that the Docker image intentionally
targets Python 3.12 instead, so the container build doesn't depend on
whatever wheel coverage the *host's* Python happens to have.

## 6. Swapping in the officially supplied `sample_events.jsonl` surfaced two planted edge cases

**What happened:** the fixture was first built by capturing ~25 seconds of
the live stream directly (since no `sample_events.jsonl` had been provided
yet). Once the assignment's own `sample_events.jsonl` was supplied, it
replaced the self-captured one -- and the existing test suite immediately
caught two things in it that the self-captured file never contained: one
line of deliberately malformed JSON (`"id":"malformed-example"`, truncated
mid-object) and one real `edit` event with `"wiki": null` and only
`server_name` set.

**Kept:** the parser already tolerated both cases by design
(`stream_client.py` skips a line it can't `json.loads`;
`EditEvent.from_raw` falls back to `server_name` when `wiki` is falsy), so
no production code needed to change. What got added was a test for each
case specifically (`test_from_raw_falls_back_to_server_name_when_wiki_is_missing`,
and `test_from_raw_parses_real_recorded_events` now asserts at least one
malformed line was encountered and skipped), so these aren't just
incidentally-passing behavior anymore.

## 7. A test exposed an implicit ordering assumption in the stats pruning

**What happened:** `tests/test_stats.py` originally asserted that an edit
recorded 10 minutes "in the past" wouldn't count toward the 5-minute
top-pages window. It failed -- not because the window math was wrong, but
because that old-timestamped event was appended to the deque *after*
newer ones. `StatsAggregator`'s pruning only ever pops from the front of
each deque (an O(1) amortized check, not a full scan), which silently
assumes events arrive in non-decreasing timestamp order.

**Changed:** reordered the test to record events chronologically (as the
real stream actually delivers them) instead of "fixing" the aggregator to
scan the whole deque on every write. Scanning everything would cost more
on every single edit to guard against a reordering scenario the real SSE
stream doesn't produce. Documented the assumption directly in
`app/stats.py` and in the README's decisions section instead of hiding it.

## 8. Frontend state management: Context + `useReducer` over a component-local hook

**Asked:** the dashboard originally kept WebSocket state in a single custom
hook (`useWikiSocket`, local `useState` calls per field) called directly
from `App.tsx`. Revisited this to use an explicit store/Context pattern
that's easy to narrate in an interview, rather than state quietly living
wherever a component happens to call a hook.

**Kept:** the actual message-handling logic (`applyMessage`) was already a
pure function, so it moved almost unchanged into `wikiPulseReducer.ts`, now
the single source of truth for how each server message type transforms
state. `WikiPulseContext.tsx` owns the WebSocket connection and
`dispatch`es into it; `App.tsx` was split into a thin provider wrapper plus
a `Dashboard.tsx` that only reads from `useWikiPulse()`.

**Rejected:** pulling in Redux or Zustand for this. The app has exactly one
piece of shared, server-driven state (edits, stats, pulse, connection
status) and no cross-cutting concerns like middleware or time-travel
debugging to justify the dependency -- Context + `useReducer` gives the
same `dispatch -> reducer -> new state` shape, is already tested the same
way a Redux reducer would be, and would need zero rewrite if the app
outgrew this later. Also deliberately kept the "filter by wiki" dropdown
selection as local component state rather than moving it into the store --
it's a per-view UI choice, not data shared across components.

## 9. Trimming `uvicorn[standard]` silently broke the one transport this app needs

**What happened:** entry 5 above describes relaxing pinned versions to
dodge a slow from-source build. At the same time, `uvicorn[standard]` got
swapped for plain `uvicorn` to cut the install further (dropping
uvloop/httptools/watchfiles, which this app doesn't need for correctness).
That reasoning missed that `[standard]` is also where uvicorn's actual
WebSocket protocol implementation (`websockets`/`wsproto`) comes from --
without either, Starlette's `@app.websocket("/ws")` route exists, but
uvicorn has no way to perform the upgrade handshake. The failure mode is
not an exception; the server starts fine, `/health` responds fine, and the
*first* real symptom is `/ws` returning a plain HTTP 404 on connect -- for
an app whose entire real-time feature is that one endpoint.

**Caught by:** actually connecting a WebSocket client end-to-end after the
backend's dependencies finished installing, rather than stopping at
`pytest` passing (the test suite mocks the transport layer entirely, so it
had no way to catch this). Fixed by adding `websockets` back as its own
explicit dependency, with a comment explaining why it's required rather
than optional, instead of pulling the whole `[standard]` bundle back in.

**Also caught in the same pass:** `EVENT_SOURCE=sample` with
`REPLAY_SPEED=0` ("replay as fast as possible") turned out to busy-loop the
event loop with no `await` yield point between events, starving every
other task -- including the signal handler needed to shut the process down
cleanly, so `kill` on the stuck process had no effect and it had to be
`kill -9`'d. Fixed by always awaiting `asyncio.sleep(gap)` (down to
`sleep(0)` at full speed) between replayed events, with a regression test
(`test_iter_sample_events_yields_control_even_at_full_speed`) that runs a
background task alongside the generator and asserts it actually got
scheduled.

## 10. A visual design pass, caught wrong by an actual screenshot, not a guess

**Asked:** to take a pass at the dashboard's visual design (tokens, a
proper hero stat, a gradient-fill line chart, a ranked bar list for top
pages, a live-dot connection badge) -- and to actually look at it running,
not just assume the CSS was right.

**What happened:** one addition was a CSS `@keyframes` fade/slide-in on
every `<tbody tr>`, meant to make new rows entering the live feed feel
less abrupt. It looked reasonable as code. Driving a real headless Chrome
against the running app (CDP screenshot, not a guess at how it'd render)
showed the opposite of the intent: rows went progressively *more*
transparent toward the top of the table instead of staying legible, and it
got worse, not better, at a higher replay speed -- the opposite of
"looks fine in rare cases."

**Changed:** removed the animation outright rather than debugging the
retrigger. A dashboard whose entire point is "data changes multiple times
a second" is exactly the wrong place for a per-row mount animation --
even a correctly-behaving one would be competing with itself constantly
at real Wikipedia edit rates. Confirmed the fix by rebuilding and
re-screenshotting the same real session, not by reasoning about the CSS
a second time.

## Chose not to use AI for

- **Which optional extras to skip.** Given the ~6 hour budget, the Go
  ingestion service and a hosted live demo were cut; Docker Compose and one
  Playwright e2e test were kept. That prioritization was a scope call, not
  something to delegate.
- **Tool choice for the e2e test.** The brief prefers Selenium + C#;
  Playwright/TypeScript was chosen instead specifically because it fits the
  existing frontend toolchain (see `e2e/README.md` for the full reasoning).
  That's a project-fit judgment, not a technical lookup.
