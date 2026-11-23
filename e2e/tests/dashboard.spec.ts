import { expect, test } from "@playwright/test";

// Assumes the backend is running with EVENT_SOURCE=sample (so the feed
// fills up deterministically without depending on live Wikipedia traffic)
// and the frontend dev server is up at BASE_URL. See e2e/README.md.

test("dashboard connects, streams edits, and filters by wiki", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "WikiPulse" })).toBeVisible();

  // The socket should move from "connecting..." to "live".
  await expect(page.getByText("live", { exact: true })).toBeVisible({ timeout: 15_000 });

  // At least one row should appear in the live feed once events start flowing.
  const feedRows = page.locator(".live-feed tbody tr");
  await expect(feedRows.first()).toBeVisible({ timeout: 15_000 });

  const wikiCells = page.locator(".live-feed tbody .col-wiki");
  const firstWiki = (await wikiCells.first().innerText()).trim();

  await page.getByLabel("Filter by wiki").selectOption(firstWiki);

  // Every visible row should now belong to the selected wiki.
  const visibleWikis = await page.locator(".live-feed tbody .col-wiki").allInnerTexts();
  for (const wiki of visibleWikis) {
    expect(wiki.trim()).toBe(firstWiki);
  }
});

test("pulse summary panel eventually shows a generated summary", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".pulse-panel .pulse-text")).toBeVisible({ timeout: 60_000 });
});
