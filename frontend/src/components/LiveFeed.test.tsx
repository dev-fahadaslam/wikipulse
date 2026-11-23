import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ALL_WIKIS, type EditEvent } from "../types";
import { applyLiveFeedTextFilters, filterEventsByWiki, LiveFeed } from "./LiveFeed";

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

describe("applyLiveFeedTextFilters", () => {
  const events = [
    makeEvent({ id: 1, title: "Alpha", user: "Alice", bot: false }),
    makeEvent({ id: 2, title: "Beta Bot Run", user: "BotAccount", bot: true }),
    makeEvent({
      id: 3,
      title: "Gamma",
      user: "Bob",
      bot: false,
      vandalism: { flagged: true, score: 0.9, reason: "blanked", source: "heuristic" },
    }),
  ];

  it("returns everything with no filters active", () => {
    expect(
      applyLiveFeedTextFilters(events, { search: "", hideBots: false, flaggedOnly: false })
    ).toHaveLength(3);
  });

  it("hides bot edits when hideBots is set", () => {
    const result = applyLiveFeedTextFilters(events, {
      search: "",
      hideBots: true,
      flaggedOnly: false,
    });
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it("keeps only flagged edits when flaggedOnly is set", () => {
    const result = applyLiveFeedTextFilters(events, {
      search: "",
      hideBots: false,
      flaggedOnly: true,
    });
    expect(result.map((e) => e.id)).toEqual([3]);
  });

  it("matches search against title or user, case-insensitively", () => {
    const byTitle = applyLiveFeedTextFilters(events, {
      search: "alpha",
      hideBots: false,
      flaggedOnly: false,
    });
    expect(byTitle.map((e) => e.id)).toEqual([1]);

    const byUser = applyLiveFeedTextFilters(events, {
      search: "bob",
      hideBots: false,
      flaggedOnly: false,
    });
    expect(byUser.map((e) => e.id)).toEqual([3]);
  });

  it("combines filters (AND, not OR)", () => {
    const result = applyLiveFeedTextFilters(events, {
      search: "bot",
      hideBots: true,
      flaggedOnly: false,
    });
    // "Beta Bot Run" matches the search term but is itself a bot edit,
    // which hideBots should still exclude.
    expect(result).toHaveLength(0);
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

  it("filters rows live as the search box is typed", () => {
    render(
      <LiveFeed
        events={[
          makeEvent({ id: 1, title: "Mars", user: "Alice" }),
          makeEvent({ id: 2, title: "Jupiter", user: "Bob" }),
        ]}
        wikiFilter={ALL_WIKIS}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/search title or user/i), {
      target: { value: "mars" },
    });
    expect(screen.getByText("Mars")).toBeInTheDocument();
    expect(screen.queryByText("Jupiter")).not.toBeInTheDocument();
  });

  it("hides bot rows once 'Hide bots' is checked", () => {
    render(
      <LiveFeed
        events={[
          makeEvent({ id: 1, title: "Human Edit", bot: false }),
          makeEvent({ id: 2, title: "Bot Edit", bot: true }),
        ]}
        wikiFilter={ALL_WIKIS}
      />
    );
    expect(screen.getByText("Bot Edit")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Hide bots"));
    expect(screen.queryByText("Bot Edit")).not.toBeInTheDocument();
    expect(screen.getByText("Human Edit")).toBeInTheDocument();
  });

  it("shows only flagged rows once 'Flagged only' is checked", () => {
    render(
      <LiveFeed
        events={[
          makeEvent({ id: 1, title: "Normal Edit" }),
          makeEvent({
            id: 2,
            title: "Flagged Edit",
            vandalism: { flagged: true, score: 0.9, reason: "blanked", source: "heuristic" },
          }),
        ]}
        wikiFilter={ALL_WIKIS}
      />
    );
    fireEvent.click(screen.getByLabelText("Flagged only"));
    expect(screen.queryByText("Normal Edit")).not.toBeInTheDocument();
    expect(screen.getByText("Flagged Edit")).toBeInTheDocument();
  });

  it("distinguishes 'no edits yet' from 'filters hide everything'", () => {
    render(<LiveFeed events={[makeEvent({ title: "Only Page" })]} wikiFilter={ALL_WIKIS} />);
    fireEvent.click(screen.getByLabelText("Flagged only"));
    expect(screen.getByText(/no edits match these filters/i)).toBeInTheDocument();
  });

  it("pausing freezes the view; resuming jumps to the latest events", () => {
    const initial = [makeEvent({ id: 1, title: "Before Pause" })];
    const { rerender } = render(<LiveFeed events={initial} wikiFilter={ALL_WIKIS} />);

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));

    const updated = [makeEvent({ id: 2, title: "After Pause" }), ...initial];
    rerender(<LiveFeed events={updated} wikiFilter={ALL_WIKIS} />);

    // Still paused: the row that arrived after pausing must not appear.
    expect(screen.queryByText("After Pause")).not.toBeInTheDocument();
    expect(screen.getByText("Before Pause")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    expect(screen.getByText("After Pause")).toBeInTheDocument();
  });
});
