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
          { wiki: "enwiki", title: "First", count: 10 },
          { wiki: "enwiki", title: "Second", count: 5 },
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
      <TopPages pages={[{ wiki: "dewiki", title: "Page", count: 1 }]} showWikiColumn={false} />
    );
    expect(screen.queryByText("dewiki")).not.toBeInTheDocument();

    rerender(<TopPages pages={[{ wiki: "dewiki", title: "Page", count: 1 }]} showWikiColumn={true} />);
    expect(screen.getByText("dewiki")).toBeInTheDocument();
  });
});
