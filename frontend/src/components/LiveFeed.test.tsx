import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ALL_WIKIS, type EditEvent } from "../types";
import { filterEventsByWiki, LiveFeed } from "./LiveFeed";

function makeEvent(overrides: Partial<EditEvent>): EditEvent {
  return {
    id: 1,
    ts: Date.now() / 1000,
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

describe("filterEventsByWiki", () => {
  const events = [
    makeEvent({ id: 1, wiki: "enwiki" }),
    makeEvent({ id: 2, wiki: "dewiki" }),
  ];

  it("returns all events for the 'all wikis' filter", () => {
    expect(filterEventsByWiki(events, ALL_WIKIS)).toHaveLength(2);
  });

  it("returns only matching events for a specific wiki", () => {
    const filtered = filterEventsByWiki(events, "dewiki");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].wiki).toBe("dewiki");
  });
});

describe("LiveFeed", () => {
  it("shows an empty state when there are no events", () => {
    render(<LiveFeed events={[]} wikiFilter={ALL_WIKIS} />);
    expect(screen.getByText(/waiting for edits/i)).toBeInTheDocument();
  });

  it("renders a row per event with title and user", () => {
    render(
      <LiveFeed
        events={[makeEvent({ title: "Alpha", user: "Alice" })]}
        wikiFilter={ALL_WIKIS}
      />
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("flags rows with a vandalism badge and reason tooltip", () => {
    render(
      <LiveFeed
        events={[
          makeEvent({
            title: "Blanked Page",
            vandalism: { flagged: true, score: 0.9, reason: "blanked the page", source: "heuristic" },
          }),
        ]}
        wikiFilter={ALL_WIKIS}
      />
    );
    const badge = screen.getByText(/possible vandalism/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "blanked the page");
  });

  it("respects the wiki filter", () => {
    render(
      <LiveFeed
        events={[
          makeEvent({ id: 1, wiki: "enwiki", title: "English Page" }),
          makeEvent({ id: 2, wiki: "dewiki", title: "German Page" }),
        ]}
        wikiFilter="dewiki"
      />
    );
    expect(screen.queryByText("English Page")).not.toBeInTheDocument();
    expect(screen.getByText("German Page")).toBeInTheDocument();
  });
});
