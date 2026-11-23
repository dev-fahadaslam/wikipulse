import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type { ServerMessage } from "../types";
import { initialWikiPulseState, wikiPulseReducer, type WikiPulseState } from "./wikiPulseReducer";

export type ConnectionStatus = "connecting" | "open" | "closed";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws";

const WikiPulseStateContext = createContext<WikiPulseState | undefined>(undefined);

/** Owns the single WebSocket connection and the app's central store
 * (a Context + useReducer "flux" store -- no extra dependency needed for a
 * dashboard this size, but the same reducer/dispatch shape a Redux-style
 * store would use, so swapping one in later is a drop-in change rather
 * than a rewrite).
 */
export function WikiPulseProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wikiPulseReducer, initialWikiPulseState);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    let closedByUs = false;

    const connect = () => {
      dispatch({ kind: "connection_status", status: "connecting" });
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        retryDelay = 1000;
        dispatch({ kind: "connection_status", status: "open" });
      };

      socket.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        dispatch({ kind: "server_message", message });
      };

      socket.onclose = () => {
        dispatch({ kind: "connection_status", status: "closed" });
        if (closedByUs) return;
        retryTimeout = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closedByUs = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      socket?.close();
    };
  }, []);

  return (
    <WikiPulseStateContext.Provider value={state}>{children}</WikiPulseStateContext.Provider>
  );
}

export function useWikiPulse(): WikiPulseState {
  const ctx = useContext(WikiPulseStateContext);
  if (ctx === undefined) {
    throw new Error("useWikiPulse must be used within a WikiPulseProvider");
  }
  return ctx;
}
