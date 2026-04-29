import { useEffect } from "react";
import { startEventStream, useDashboard } from "./hooks/useDashboard.ts";
import { useNotifications } from "./hooks/useNotifications.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { TokenMeter } from "./components/TokenMeter.tsx";
import { CenterPanel } from "./components/CenterPanel.tsx";
import { EventTimeline } from "./components/EventTimeline.tsx";
import { AgentRoster } from "./components/AgentRoster.tsx";
import { Header } from "./components/Header.tsx";
import { AgentModal } from "./components/AgentModal.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

export default function App(): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const connected = useDashboard((s) => s.connected);
  const setCenterTab = useDashboard((s) => s.setCenterTab);
  const openAgentModal = useDashboard((s) => s.openAgentModal);

  useEffect(() => startEventStream(), []);
  useNotifications();

  // global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "1") setCenterTab("choreography");
      else if (e.key === "2") setCenterTab("live");
      else if (e.key === "3") setCenterTab("memory");
      else if (e.key === "Escape") openAgentModal(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCenterTab, openAgentModal]);

  return (
    <div className="grid h-screen grid-cols-[280px_1fr] grid-rows-[auto_1fr] bg-bg text-fg">
      <div className="col-span-2 row-start-1 border-b border-border">
        <Header connected={connected} />
      </div>
      <aside className="row-start-2 border-r border-border bg-bg-elev/40 overflow-y-auto">
        <Sidebar />
      </aside>
      <main className="row-start-2 overflow-hidden">
        <ErrorBoundary>
          {snapshot ? (
            <DashboardLayout />
          ) : (
            <div className="grid h-full place-items-center text-fg-dim">
              <div className="flex items-center gap-3">
                <span className="size-2 rounded-full bg-accent pulse-soft" />
                <span className="text-sm tracking-wide">awaiting first snapshot…</span>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </main>
      <AgentModal />
    </div>
  );
}

function DashboardLayout(): JSX.Element {
  return (
    <div className="grid h-full grid-cols-[1fr_360px] grid-rows-[auto_1fr_280px] gap-px bg-border">
      <div className="col-span-2 row-start-1 grid grid-cols-3 gap-px bg-border auto-rows-auto">
        <TokenMeter />
      </div>
      <section className="col-start-1 row-start-2 bg-bg overflow-hidden">
        <CenterPanel />
      </section>
      <section className="col-start-2 row-start-2 bg-bg overflow-y-auto">
        <AgentRoster />
      </section>
      <section className="col-span-2 row-start-3 bg-bg overflow-hidden">
        <EventTimeline />
      </section>
    </div>
  );
}
