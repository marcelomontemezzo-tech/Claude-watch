import { useEffect, useMemo, useState } from "react";
import type { ProjectBudget, ProjectSummary } from "@shared/types.ts";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatCost } from "../lib/utils.ts";

type Tab = "budget" | "tags" | "audit";

export function ProjectGovernance(): JSX.Element | null {
  const projectKey = useDashboard((s) => s.budgetEditorProjectKey);
  const close = useDashboard((s) => s.openBudgetEditor);
  const snapshot = useDashboard((s) => s.snapshot);
  const project = useMemo(
    () => snapshot?.projects.find((p) => p.projectKey === projectKey) ?? null,
    [snapshot, projectKey],
  );
  const [tab, setTab] = useState<Tab>("budget");

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") close(null);
    }
    if (projectKey) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectKey, close]);

  if (!projectKey || !project) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-bg/80 backdrop-blur-sm"
      onClick={() => close(null)}
    >
      <div
        className="w-[640px] max-w-[92vw] max-h-[80vh] flex flex-col rounded-md border border-border bg-bg-card shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Project governance
            </div>
            <div className="mt-1 text-base font-medium truncate">{project.displayName}</div>
            <div className="text-[11px] text-fg-dim truncate tabular">{project.cwd}</div>
          </div>
          <button
            onClick={() => close(null)}
            aria-label="Close"
            className="size-7 grid place-items-center rounded-sm text-fg-muted hover:text-fg hover:bg-bg-hover"
          >
            <span className="block h-3 w-3 relative">
              <span className="absolute inset-0 rotate-45 border-t border-current top-1/2" />
              <span className="absolute inset-0 -rotate-45 border-t border-current top-1/2" />
            </span>
          </button>
        </header>

        <nav className="px-5 border-b border-border flex gap-5 text-[11px] uppercase tracking-[0.18em]">
          {(["budget", "tags", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "py-3 -mb-px border-b border-transparent transition-colors",
                tab === t ? "border-accent text-fg" : "text-fg-dim hover:text-fg",
              )}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 overflow-auto">
          {tab === "budget" && <BudgetEditor project={project} />}
          {tab === "tags" && <TagsEditor project={project} />}
          {tab === "audit" && <AuditExport project={project} />}
        </div>
      </div>
    </div>
  );
}

function BudgetEditor({ project }: { project: ProjectSummary }): JSX.Element {
  const initial = project.budget;
  const [monthly, setMonthly] = useState<string>(
    initial?.monthly != null ? String(initial.monthly) : "",
  );
  const [threshold, setThreshold] = useState<string>(
    initial?.alertThreshold != null ? String(Math.round(initial.alertThreshold * 100)) : "80",
  );
  const [day, setDay] = useState<string>(
    initial?.rolloverDay != null ? String(initial.rolloverDay) : "1",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const m = Number(monthly);
      if (!Number.isFinite(m) || m < 0) throw new Error("Monthly must be a non-negative number");
      const tPct = Number(threshold);
      if (!Number.isFinite(tPct) || tPct <= 0 || tPct >= 100) {
        throw new Error("Threshold must be between 1 and 99");
      }
      const d = Number(day);
      if (!Number.isFinite(d) || d < 1 || d > 28) {
        throw new Error("Rollover day must be between 1 and 28");
      }
      const budget: ProjectBudget = {
        monthly: m,
        alertThreshold: tPct / 100,
        rolloverDay: Math.floor(d),
      };
      const res = await fetch(
        `/api/governance/budgets/${encodeURIComponent(project.projectKey)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budget }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/governance/budgets/${encodeURIComponent(project.projectKey)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budget: null }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Clear failed");
      setMonthly("");
      setThreshold("80");
      setDay("1");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const monthCost = project.monthCost ?? 0;

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Monthly cap (USD)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Alert at (%)">
          <input
            type="number"
            min="1"
            max="99"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Rollover day">
          <input
            type="number"
            min="1"
            max="28"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="input"
          />
        </Field>
      </div>
      <div className="flex items-center justify-between text-[11px] tabular text-fg-muted border-t border-border pt-3">
        <span>This month spent: {formatCost(monthCost)}</span>
        {project.budgetState && (
          <span
            className={cn(
              "uppercase tracking-[0.18em] text-[10px]",
              project.budgetState === "over" && "text-danger",
              project.budgetState === "near" && "text-warning",
              project.budgetState === "under" && "text-success",
            )}
          >
            {project.budgetState}
          </span>
        )}
      </div>
      {err && <div className="text-[11px] text-danger">{err}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={() => void clear()}
          disabled={busy}
          className="btn-ghost"
        >
          Clear budget
        </button>
        <button
          onClick={() => void save()}
          disabled={busy}
          className="btn-primary"
        >
          Save
        </button>
      </div>
      <style>{`
        .input { background: var(--color-bg-elev); border: 1px solid var(--color-border); color: var(--color-fg); padding: 0.4rem 0.6rem; border-radius: 4px; font-variant-numeric: tabular-nums; width: 100%; font-size: 12px; }
        .input:focus { outline: none; border-color: var(--color-accent); }
        .btn-ghost { background: transparent; border: 1px solid var(--color-border); color: var(--color-fg-muted); padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; }
        .btn-ghost:hover:not(:disabled) { color: var(--color-fg); border-color: var(--color-border-strong); }
        .btn-primary { background: var(--color-accent); color: var(--color-bg); border: 1px solid var(--color-accent); padding: 0.4rem 0.9rem; border-radius: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 500; }
        .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
        .btn-primary:disabled, .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[9px] uppercase tracking-[0.18em] text-fg-dim">{label}</span>
      {children}
    </label>
  );
}

function TagsEditor({ project }: { project: ProjectSummary }): JSX.Element {
  const [draft, setDraft] = useState(project.tags?.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const tags = draft
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const res = await fetch(
        `/api/governance/tags/${encodeURIComponent(project.projectKey)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <Field label="Tags (comma or newline separated)">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="client-acme, prod, ops"
          rows={3}
          className="bg-bg-elev border border-border text-fg p-2 rounded text-xs leading-relaxed focus:outline-none focus:border-accent"
        />
      </Field>
      <div className="text-[11px] text-fg-dim">
        Click a tag in the sidebar to filter the dashboard.
      </div>
      {err && <div className="text-[11px] text-danger">{err}</div>}
      <div className="flex justify-end pt-1">
        <button
          onClick={() => void save()}
          disabled={busy}
          className="bg-accent text-bg px-3 py-1.5 rounded text-[11px] uppercase tracking-[0.16em] disabled:opacity-50"
        >
          Save tags
        </button>
      </div>
    </div>
  );
}

function AuditExport({ project }: { project: ProjectSummary }): JSX.Element {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [kinds, setKinds] = useState<string>("");
  const [format, setFormat] = useState<"ndjson" | "csv">("ndjson");

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set("project", project.projectKey);
    params.set("format", format);
    if (from) params.set("from", String(new Date(from).getTime()));
    if (to) params.set("to", String(new Date(to).getTime()));
    if (kinds.trim()) params.set("kinds", kinds.replace(/\s+/g, ""));
    return `/api/audit/export?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From (local)">
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-bg-elev border border-border text-fg p-1.5 rounded text-xs focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="To (local)">
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-bg-elev border border-border text-fg p-1.5 rounded text-xs focus:outline-none focus:border-accent"
          />
        </Field>
      </div>
      <Field label="Kinds (comma list, blank = all)">
        <input
          value={kinds}
          onChange={(e) => setKinds(e.target.value)}
          placeholder="tool_call, tool_result, assistant_message"
          className="bg-bg-elev border border-border text-fg p-1.5 rounded text-xs focus:outline-none focus:border-accent"
        />
      </Field>
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
          <span className="text-fg-dim">format</span>
          <button
            onClick={() => setFormat("ndjson")}
            className={cn(
              "px-2 py-1 rounded-sm border",
              format === "ndjson"
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-fg-muted",
            )}
          >
            ndjson
          </button>
          <button
            onClick={() => setFormat("csv")}
            className={cn(
              "px-2 py-1 rounded-sm border",
              format === "csv"
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-fg-muted",
            )}
          >
            csv
          </button>
        </div>
        <a
          href={buildUrl()}
          download
          className="bg-accent text-bg px-3 py-1.5 rounded text-[11px] uppercase tracking-[0.16em] no-underline"
        >
          Download
        </a>
      </div>
    </div>
  );
}
