import { useEffect, useRef } from "react";
import { useDashboard } from "./useDashboard.ts";

const FIRED_KEY = "claude-watch-notif-fired";

interface FiredState {
  fiveHourThreshold: number; // last fired bucket (50, 70, 85, 95)
  weeklyThreshold: number;
  errorIds: string[];
  budgetState: Record<string, "near" | "over">;
  date: string; // YYYY-MM-DD reset daily
}

function loadFired(): FiredState {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FiredState>;
      return {
        fiveHourThreshold: parsed.fiveHourThreshold ?? 0,
        weeklyThreshold: parsed.weeklyThreshold ?? 0,
        errorIds: parsed.errorIds ?? [],
        budgetState: parsed.budgetState ?? {},
        date: parsed.date ?? today(),
      };
    }
  } catch {}
  return { fiveHourThreshold: 0, weeklyThreshold: 0, errorIds: [], budgetState: {}, date: today() };
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function saveFired(s: FiredState): void {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(s));
  } catch {}
}

function notify(title: string, body: string, tag: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, icon: "/favicon.ico" });
  } catch {}
}

export function useNotifications(): void {
  const enabled = useDashboard((s) => s.notificationsEnabled);
  const budgetEnabled = useDashboard((s) => s.notifyOnBudgetOver);
  const snapshot = useDashboard((s) => s.snapshot);
  const firedRef = useRef<FiredState>(loadFired());

  useEffect(() => {
    if (!enabled || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !snapshot) return;
    const fired = firedRef.current;

    if (fired.date !== today()) {
      fired.fiveHourThreshold = 0;
      fired.weeklyThreshold = 0;
      fired.errorIds = [];
      fired.date = today();
    }

    const tiers = [50, 70, 85, 95];
    const fiveH = snapshot.usage.fiveHour.pct * 100;
    const weekly = snapshot.usage.weeklyAll.pct * 100;

    for (const t of tiers) {
      if (fiveH >= t && fired.fiveHourThreshold < t) {
        notify("5-hour usage", `Now at ${fiveH.toFixed(0)}% of 5h limit`, `5h-${t}`);
        fired.fiveHourThreshold = t;
      }
      if (weekly >= t && fired.weeklyThreshold < t) {
        notify("Weekly usage", `Now at ${weekly.toFixed(0)}% of weekly limit`, `weekly-${t}`);
        fired.weeklyThreshold = t;
      }
    }

    // Budget thresholds
    if (budgetEnabled) {
      for (const proj of snapshot.projects) {
        const state = proj.budgetState;
        if (state !== "near" && state !== "over") continue;
        if (fired.budgetState[proj.projectKey] === state) continue;
        fired.budgetState[proj.projectKey] = state;
        notify(
          state === "over" ? "Budget over" : "Budget near limit",
          `${proj.displayName}: ${state}`,
          `budget-${proj.projectKey}-${state}`,
        );
      }
    }

    // Errors in flow
    if (snapshot.flow) {
      for (const node of snapshot.flow.nodes) {
        if (node.status === "error" && node.parentToolUseId && !fired.errorIds.includes(node.id)) {
          notify("Agent error", `${node.agentType}: ${(node.errorMessage ?? "").slice(0, 100)}`, `err-${node.id}`);
          fired.errorIds.push(node.id);
          if (fired.errorIds.length > 100) fired.errorIds.shift();
        }
      }
    }

    saveFired(fired);
  }, [enabled, snapshot]);
}
