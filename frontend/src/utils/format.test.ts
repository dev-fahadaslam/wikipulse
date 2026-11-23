import { describe, expect, it } from "vitest";
import { formatDelta, formatRelativeTime } from "./format";

describe("formatRelativeTime", () => {
  const nowMs = 1_700_000_000_000;

  it("shows 'just now' for very recent timestamps", () => {
    expect(formatRelativeTime(nowMs / 1000, nowMs)).toBe("just now");
  });

  it("shows seconds for sub-minute gaps", () => {
    expect(formatRelativeTime(nowMs / 1000 - 15, nowMs)).toBe("15s ago");
  });

  it("shows minutes for sub-hour gaps", () => {
    expect(formatRelativeTime(nowMs / 1000 - 125, nowMs)).toBe("2m ago");
  });

  it("shows hours for longer gaps", () => {
    expect(formatRelativeTime(nowMs / 1000 - 7_300, nowMs)).toBe("2h ago");
  });
});

describe("formatDelta", () => {
  it("prefixes positive deltas with a plus sign", () => {
    expect(formatDelta(42)).toBe("+42");
  });

  it("leaves negative deltas as-is", () => {
    expect(formatDelta(-42)).toBe("-42");
  });

  it("does not add a plus sign to zero", () => {
    expect(formatDelta(0)).toBe("0");
  });
});
