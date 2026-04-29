import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DashboardSnapshot, ServerEvent } from "@shared/types.ts";

interface DashboardState {
  snapshot: DashboardSnapshot | null;
  connected: boolean;
  selectedProjectKey: string | null;
  selectedAgentName: string | null;
  pipelineFilter: string | null;
  centerTab: "live" | "choreography" | "memory";
  scrub: { enabled: boolean; atTime: number | null; speed: number; playing: boolean };
  notificationsEnabled: boolean;
  search: string;
  setSnapshot: (snap: DashboardSnapshot) => void;
  setConnected: (connected: boolean) => void;
  selectProject: (key: string | null) => void;
  openAgentModal: (name: string | null) => void;
  setPipelineFilter: (id: string | null) => void;
  setCenterTab: (t: "live" | "choreography" | "memory") => void;
  setScrub: (patch: Partial<DashboardState["scrub"]>) => void;
  setNotifications: (v: boolean) => void;
  setSearch: (s: string) => void;
}

export const useDashboard = create<DashboardState>()(
  persist(
    (set) => ({
      snapshot: null,
      connected: false,
      selectedProjectKey: null,
      selectedAgentName: null,
      pipelineFilter: null,
      centerTab: "choreography",
      scrub: { enabled: false, atTime: null, speed: 1, playing: false },
      notificationsEnabled: false,
      search: "",
      setSnapshot: (snap) =>
        set((s) => ({
          snapshot: snap,
          selectedProjectKey: s.selectedProjectKey ?? snap.activeProjectKey,
        })),
      setConnected: (connected) => set({ connected }),
      selectProject: (key) => set({ selectedProjectKey: key }),
      openAgentModal: (name) => set({ selectedAgentName: name }),
      setPipelineFilter: (id) => set({ pipelineFilter: id }),
      setCenterTab: (t) => set({ centerTab: t }),
      setScrub: (patch) => set((s) => ({ scrub: { ...s.scrub, ...patch } })),
      setNotifications: (v) => set({ notificationsEnabled: v }),
      setSearch: (s) => set({ search: s }),
    }),
    {
      name: "claude-watch-state",
      partialize: (s) => ({
        selectedProjectKey: s.selectedProjectKey,
        pipelineFilter: s.pipelineFilter,
        centerTab: s.centerTab,
        notificationsEnabled: s.notificationsEnabled,
      }),
    },
  ),
);

export function startEventStream(): () => void {
  let es: EventSource | null = null;
  let cancelled = false;
  let retry = 0;

  const connect = (): void => {
    if (cancelled) return;
    es = new EventSource("/events");
    es.onopen = () => {
      retry = 0;
      useDashboard.getState().setConnected(true);
    };
    es.onerror = () => {
      useDashboard.getState().setConnected(false);
      es?.close();
      const delay = Math.min(1000 * 2 ** retry++, 8000);
      setTimeout(connect, delay);
    };
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as ServerEvent;
        if (event.type === "snapshot") {
          useDashboard.getState().setSnapshot(event.payload);
        }
      } catch (err) {
        console.error("event parse failed", err);
      }
    };
  };

  connect();

  return () => {
    cancelled = true;
    es?.close();
  };
}
