import type { ConnectionStatus } from "./WikiPulseContext";
import type { EditEvent, PulseSummary, ServerMessage, StatsSnapshot } from "../types";

const MAX_FEED_LENGTH = 150;

export interface WikiPulseState {
  status: ConnectionStatus;
  feed: EditEvent[];
  stats: StatsSnapshot | null;
  pulse: PulseSummary | null;
}

export type WikiPulseAction =
  | { kind: "connection_status"; status: ConnectionStatus }
  | { kind: "server_message"; message: ServerMessage };

export const initialWikiPulseState: WikiPulseState = {
  status: "connecting",
  feed: [],
  stats: null,
  pulse: null,
};

/** Pure state transition logic, kept separate from the WebSocket's side
 * effects so it can be unit tested without mounting React or opening a
 * socket (see wikiPulseReducer.test.ts).
 */
export function wikiPulseReducer(state: WikiPulseState, action: WikiPulseAction): WikiPulseState {
  switch (action.kind) {
    case "connection_status":
      return { ...state, status: action.status };
    case "server_message":
      return applyServerMessage(state, action.message);
  }
}

function applyServerMessage(state: WikiPulseState, message: ServerMessage): WikiPulseState {
  switch (message.type) {
    case "init":
      return { ...state, stats: message.data.stats, pulse: message.data.pulse };
    case "edit":
      return { ...state, feed: [message.data, ...state.feed].slice(0, MAX_FEED_LENGTH) };
    case "stats":
      return { ...state, stats: message.data };
    case "pulse":
      return { ...state, pulse: message.data };
    case "vandalism_update":
      return {
        ...state,
        feed: state.feed.map((e) =>
          e.id === message.data.id && e.wiki === message.data.wiki
            ? { ...e, vandalism: message.data.vandalism }
            : e
        ),
      };
  }
}
