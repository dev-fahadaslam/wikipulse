import { describe, expect, it } from "vitest";
import type { EditEvent, PulseSummary, StatsSnapshot } from "../types";
import { initialWikiPulseState, wikiPulseReducer, type WikiPulseState } from "./wikiPulseReducer";

function makeEvent(overrides: Partial<EditEvent>): EditEvent {
  return {
    id: 1,
    ts: 1_700_000_000,
    wiki: "enwiki",
    server_name: "en.wikipedia.org",
    title: "Test Page",
    url: null,
    user: "Someone",
    bot: false,
    minor: false,
    change_type: "edit",
    comment: "",
    length_old: 100,
    length_new: 110,
    delta: 10,
    vandalism: null,
    ...overrides,
  };
}

const emptyStats: StatsSnapshot = {
  generated_at: 1_700_000_000,
  wikis: [],
  overall: { epm_series: [], edits_last_60s: 0, top_pages: [] },
  by_wiki: {},
};

const pulse: PulseSummary = {
  summary: "Things are happening.",
  generated_at: 1_700_000_000,
  source: "fallback",
};

describe("wikiPulseReducer", () => {
  it("starts in the connecting state with no data", () => {
    expect(initialWikiPulseState.status).toBe("connecting");
    expect(initialWikiPulseState.feed).toEqual([]);
    expect(initialWikiPulseState.stats).toBeNull();
    expect(initialWikiPulseState.pulse).toBeNull();
    expect(initialWikiPulseState.editsSeen).toBe(0);
  });

  it("updates connection status without touching other fields", () => {
    const state = wikiPulseReducer(initialWikiPulseState, {
      kind: "connection_status",
      status: "open",
    });
    expect(state.status).toBe("open");
    expect(state.feed).toBe(initialWikiPulseState.feed);
  });

  it("applies an init message to seed stats and pulse", () => {
    const state = wikiPulseReducer(initialWikiPulseState, {
      kind: "server_message",
      message: { type: "init", data: { stats: emptyStats, pulse } },
    });
    expect(state.stats).toBe(emptyStats);
    expect(state.pulse).toBe(pulse);
  });

  it("prepends new edits to the front of the feed", () => {
    let state: WikiPulseState = initialWikiPulseState;
    state = wikiPulseReducer(state, {
      kind: "server_message",
      message: { type: "edit", data: makeEvent({ id: 1, title: "First" }) },
    });
    state = wikiPulseReducer(state, {
      kind: "server_message",
      message: { type: "edit", data: makeEvent({ id: 2, title: "Second" }) },
    });
    expect(state.feed.map((e) => e.title)).toEqual(["Second", "First"]);
  });

  it("caps the feed at 150 entries but keeps counting editsSeen uncapped", () => {
    let state: WikiPulseState = initialWikiPulseState;
    for (let i = 0; i < 160; i++) {
      state = wikiPulseReducer(state, {
        kind: "server_message",
        message: { type: "edit", data: makeEvent({ id: i }) },
      });
    }
    expect(state.feed).toHaveLength(150);
    expect(state.editsSeen).toBe(160);
  });

  it("replaces stats wholesale on a stats message", () => {
    const state = wikiPulseReducer(initialWikiPulseState, {
      kind: "server_message",
      message: { type: "stats", data: emptyStats },
    });
    expect(state.stats).toBe(emptyStats);
  });

  it("patches only the matching event on vandalism_update, by id and wiki", () => {
    let state: WikiPulseState = initialWikiPulseState;
    state = wikiPulseReducer(state, {
      kind: "server_message",
      message: { type: "edit", data: makeEvent({ id: 42, wiki: "enwiki" }) },
    });
    state = wikiPulseReducer(state, {
      kind: "server_message",
      message: { type: "edit", data: makeEvent({ id: 42, wiki: "dewiki" }) },
    });

    state = wikiPulseReducer(state, {
      kind: "server_message",
      message: {
        type: "vandalism_update",
        data: {
          id: 42,
          wiki: "enwiki",
          vandalism: { flagged: true, score: 0.9, reason: "blanked", source: "ai" },
        },
      },
    });

    const enwikiEvent = state.feed.find((e) => e.wiki === "enwiki");
    const dewikiEvent = state.feed.find((e) => e.wiki === "dewiki");
    expect(enwikiEvent?.vandalism).toEqual({
      flagged: true,
      score: 0.9,
      reason: "blanked",
      source: "ai",
    });
    expect(dewikiEvent?.vandalism).toBeNull();
  });
});
