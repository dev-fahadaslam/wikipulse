import { describe, expect, it } from "vitest";
import { ALL_WIKIS, type StatsSnapshot } from "../types";
import { selectStatsBucket } from "./selectors";

const stats: StatsSnapshot = {
  generated_at: 1_700_000_000,
  wikis: [{ wiki: "enwiki", count_recent: 5 }],
  overall: { epm_series: [], edits_last_60s: 10, top_pages: [] },
  by_wiki: {
    enwiki: { epm_series: [], edits_last_60s: 3, top_pages: [] },
  },
};

describe("selectStatsBucket", () => {
  it("returns the overall bucket for ALL_WIKIS", () => {
    expect(selectStatsBucket(stats, ALL_WIKIS)).toBe(stats.overall);
  });

  it("returns the matching wiki's bucket when present", () => {
    expect(selectStatsBucket(stats, "enwiki")).toBe(stats.by_wiki.enwiki);
  });

  it("falls back to overall for a wiki not in by_wiki", () => {
    expect(selectStatsBucket(stats, "dewiki")).toBe(stats.overall);
  });

  it("does not throw when stats is null, for any filter", () => {
    expect(selectStatsBucket(null, ALL_WIKIS)).toBeUndefined();
    expect(selectStatsBucket(null, "enwiki")).toBeUndefined();
  });
});
