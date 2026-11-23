import { ALL_WIKIS, type StatsBucket, type StatsSnapshot } from "../types";

/** The stats bucket a given wiki filter should read from: the overall
 * bucket for ALL_WIKIS, that wiki's bucket when known, and a fallback to
 * overall otherwise (a wiki can be selected in the dropdown one tick before
 * its own by_wiki entry exists, or stop being one of the tracked top wikis).
 * Pulled out of Dashboard.tsx so this selection logic is directly unit
 * testable instead of only reachable through a full component render.
 */
export function selectStatsBucket(
  stats: StatsSnapshot | null,
  wikiFilter: string
): StatsBucket | undefined {
  if (wikiFilter === ALL_WIKIS) return stats?.overall;
  return stats?.by_wiki?.[wikiFilter] ?? stats?.overall;
}
