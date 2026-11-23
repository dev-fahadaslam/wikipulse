import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopPages } from "./TopPages";

describe("TopPages", () => {
  it("shows an empty state with no pages", () => {
    render(<TopPages pages={[]} showWikiColumn={false} />);
    expect(screen.getByText(/no repeated edits yet/i)).toBeInTheDocument();
  });

  it("ranks pages in the order given", () => {
    render(
      <TopPages
        pages={[
          { wiki: "enwiki", title: "First", count: 10, url: null },
          { wiki: "enwiki", title: "Second", count: 5, url: null },
        ]}
        showWikiColumn={false}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("First");
    expect(items[1]).toHaveTextContent("Second");
  });

  it("shows the wiki tag only when showWikiColumn is true", () => {
    const { rerender } = render(
      <TopPages
        pages={[{ wiki: "dewiki", title: "Page", count: 1, url: null }]}
        showWikiColumn={false}
      />
    );
    expect(screen.queryByText("dewiki")).not.toBeInTheDocument();

    rerender(
      <TopPages
        pages={[{ wiki: "dewiki", title: "Page", count: 1, url: null }]}
        showWikiColumn={true}
      />
    );
    expect(screen.getByText("dewiki")).toBeInTheDocument();
  });

  it("links the title when a url is known", () => {
    render(
      <TopPages
        pages={[
          {
            wiki: "enwiki",
            title: "Linked Page",
            count: 1,
            url: "https://en.wikipedia.org/wiki/Linked_Page",
          },
        ]}
        showWikiColumn={false}
      />
    );
    const link = screen.getByRole("link", { name: "Linked Page" });
    expect(link).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Linked_Page");
  });

  it("renders plain text when no url is known", () => {
    render(
      <TopPages
        pages={[{ wiki: "enwiki", title: "Unlinked Page", count: 1, url: null }]}
        showWikiColumn={false}
      />
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Unlinked Page")).toBeInTheDocument();
  });
});
