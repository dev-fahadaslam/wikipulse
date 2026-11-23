export interface VandalismInfo {
  flagged: boolean;
  score: number;
  reason: string | null;
  source: "heuristic" | "ai";
}

export interface EditEvent {
  id: number;
  ts: number;
  wiki: string;
  server_name: string;
  title: string;
  url: string | null;
  user: string;
  bot: boolean;
  minor: boolean;
  change_type: "edit" | "new";
  comment: string;
  length_old: number | null;
  length_new: number | null;
  delta: number;
  vandalism: VandalismInfo | null;
}

export interface EpmPoint {
  minute: number;
  count: number;
}

export interface TopPage {
  wiki: string;
  title: string;
  count: number;
}

export interface StatsBucket {
  epm_series: EpmPoint[];
  edits_last_60s: number;
  top_pages: TopPage[];
}

export interface WikiVolume {
  wiki: string;
  count_recent: number;
}

export interface StatsSnapshot {
  generated_at: number;
  wikis: WikiVolume[];
  overall: StatsBucket;
  by_wiki: Record<string, StatsBucket>;
}

export interface PulseSummary {
  summary: string;
  generated_at: number;
  source: "ai" | "fallback";
}

export type ServerMessage =
  | { type: "init"; data: { stats: StatsSnapshot; pulse: PulseSummary | null } }
  | { type: "edit"; data: EditEvent }
  | { type: "stats"; data: StatsSnapshot }
  | { type: "pulse"; data: PulseSummary }
  | {
      type: "vandalism_update";
      data: { id: number; wiki: string; vandalism: VandalismInfo };
    };

export const ALL_WIKIS = "__all__";
