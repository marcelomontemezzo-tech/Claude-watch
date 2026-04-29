import { useEffect } from "react";
import { startEventStream, useDashboard } from "./hooks/useDashboard.ts";
import { useNotifications } from "./hooks/useNotifications.ts";
import { TopTabs } from "./components/TopTabs.tsx";
import { MonitorPage } from "./components/MonitorPage.tsx";
import { EditorPage } from "./components/EditorPage.tsx";
import { AgentModal } from "./components/AgentModal.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

export default function App(): JSX.Element {
  const topTab = useDashboard((s) => s.topTab);
  const setTopTab = useDashboard((s) => s.setTopTab);
  const setCenterTab = useDashboard((s) => s.setCenterTab);
  const openAgentModal = useDashboard((s) => s.openAgentModal);

  useEffect(() => startEventStream(), []);
  useNotifications();

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === "m" && !e.altKey) setTopTab("monitor");
      else if (e.key === "e" && !e.altKey) setTopTab("editor");
      else if (e.key === "1") setCenterTab("choreography");
      else if (e.key === "2") setCenterTab("live");
      else if (e.key === "3") setCenterTab("memory");
      else if (e.key === "Escape") openAgentModal(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCenterTab, openAgentModal, setTopTab]);

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] bg-bg text-fg">
      <TopTabs />
      <main className="overflow-hidden">
        <ErrorBoundary>
          {topTab === "monitor" ? <MonitorPage /> : <EditorPage />}
        </ErrorBoundary>
      </main>
      <AgentModal />
    </div>
  );
}
