import { useEffect, useRef, useState } from "react";
import type { AgentDetail } from "@shared/types.ts";
import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, formatDuration, relativeTime } from "../lib/utils.ts";

const MODEL_OPTIONS: { value: string; label: string; family: "opus" | "sonnet" | "haiku" }[] = [
  { value: "claude-opus-4-7", label: "Opus 4.7", family: "opus" },
  { value: "claude-opus-4-6", label: "Opus 4.6", family: "opus" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6", family: "sonnet" },
  { value: "claude-sonnet-4-5", label: "Sonnet 4.5", family: "sonnet" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5", family: "haiku" },
  { value: "inherit", label: "Inherit (no override)", family: "opus" },
];

type Tab = "overview" | "personality" | "last-run" | "history";

export function AgentModal(): JSX.Element | null {
  const agentName = useDashboard((s) => s.selectedAgentName);
  const projectKey = useDashboard((s) => s.selectedProjectKey ?? s.snapshot?.activeProjectKey ?? null);
  const close = useDashboard((s) => s.openAgentModal);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [editedModel, setEditedModel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirtyContent = editedContent != null && detail && editedContent !== detail.rawContent;
  const dirtyModel = editedModel != null && detail && editedModel !== (detail.preferredModel ?? "inherit");

  useEffect(() => {
    if (!agentName) {
      setDetail(null);
      setEditedContent(null);
      setEditedModel(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/agents/${encodeURIComponent(agentName)}?project=${encodeURIComponent(projectKey ?? "")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: AgentDetail) => {
        setDetail(d);
        setEditedContent(d.rawContent);
        setEditedModel(d.preferredModel ?? "inherit");
      })
      .catch((e) => setError(String(e.message)))
      .finally(() => setLoading(false));
  }, [agentName, projectKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") close(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!agentName) return null;

  async function save(): Promise<void> {
    if (!detail || !agentName) return;
    setSaving(true);
    setError(null);
    const body: { content?: string; model?: string | null } = {};
    if (dirtyContent) body.content = editedContent ?? "";
    if (dirtyModel) body.model = editedModel === "inherit" ? null : editedModel;
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentName)}?project=${encodeURIComponent(projectKey ?? "")}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: AgentDetail = await res.json();
      setDetail(updated);
      setEditedContent(updated.rawContent);
      setEditedModel(updated.preferredModel ?? "inherit");
      setSavedAt(Date.now());
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  async function openInEditor(): Promise<void> {
    if (!agentName) return;
    await fetch(
      `/api/agents/${encodeURIComponent(agentName)}/open?project=${encodeURIComponent(projectKey ?? "")}`,
      { method: "POST" },
    );
  }

  function obsidianUri(): string | null {
    if (!detail?.isInsideObsidian || !detail.obsidianVault || !detail.obsidianRelPath) return null;
    const file = detail.obsidianRelPath.replace(/\.md$/, "");
    return `obsidian://open?vault=${encodeURIComponent(detail.obsidianVault)}&file=${encodeURIComponent(file)}`;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-bg/80 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && close(null)}
      role="dialog"
      aria-modal="true"
      aria-label={`Agent: ${agentName}`}
    >
      <div className="bg-bg-elev border border-border-strong rounded-md shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)] w-[min(960px,92vw)] h-[min(720px,88vh)] flex flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-4 px-5 py-3.5 border-b border-border">
          <div className="flex flex-col min-w-0 gap-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={cn(
                  "text-[9px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-sm shrink-0",
                  detail?.kind === "skill" ? "bg-info/15 text-info" : "bg-accent/15 text-accent",
                )}
              >
                {detail?.kind ?? "agent"}
              </span>
              <h2 className="font-semibold text-base truncate text-fg leading-tight">{agentName}</h2>
            </div>
            {detail && (
              <span className="text-[10px] uppercase tracking-[0.16em] text-fg-dim">
                {detail.source}
                {detail.pluginName ? <span className="text-fg-dim/60"> · {detail.pluginName}</span> : null}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {savedAt && (
              <span className="text-[10px] text-success tabular">saved {relativeTime(savedAt)}</span>
            )}
            <button
              onClick={openInEditor}
              className="text-[10px] uppercase tracking-[0.16em] px-2 py-1 rounded-sm border border-border bg-bg-card text-fg-muted hover:bg-bg-hover hover:text-fg transition-colors"
              title={detail?.filePath}
            >
              open in editor
            </button>
            {obsidianUri() && (
              <a
                href={obsidianUri()!}
                className="text-[10px] uppercase tracking-[0.16em] px-2 py-1 rounded-sm border border-info/40 bg-info/10 text-info hover:bg-info/20 transition-colors"
              >
                obsidian
              </a>
            )}
            <button
              onClick={() => close(null)}
              aria-label="Close dialog"
              className={cn(
                "size-7 grid place-items-center rounded-sm border border-transparent",
                "text-fg-dim hover:text-fg hover:bg-bg-hover hover:border-border",
                "transition-colors",
              )}
            >
              <span aria-hidden className="relative block size-3">
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 rotate-45 bg-current" />
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 -rotate-45 bg-current" />
              </span>
            </button>
          </div>
        </header>

        <nav className="flex border-b border-border bg-bg-elev/40 px-2">
          {(["overview", "personality", "last-run", "history"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-2.5 text-[12px] font-medium transition-colors -mb-px border-b-2 flex items-center gap-2",
                tab === t
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-dim hover:text-fg-muted",
              )}
            >
              {t === "overview" && "Overview"}
              {t === "personality" && "Personality"}
              {t === "last-run" && "Last run"}
              {t === "history" && (
                <>
                  History
                  {detail?.history && detail.history.totalInvocations > 0 && (
                    <span className="text-[9px] tabular px-1 py-px rounded-sm bg-bg-card text-fg-dim">
                      {detail.history.totalInvocations}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {loading && <div className="text-fg-dim text-xs">loading…</div>}
          {error && <div className="text-danger text-xs">error: {error}</div>}
          {detail && tab === "overview" && <OverviewTab detail={detail} editedModel={editedModel} setEditedModel={setEditedModel} />}
          {detail && tab === "personality" && (
            <PersonalityTab
              content={editedContent ?? ""}
              setContent={setEditedContent}
              filePath={detail.filePath}
            />
          )}
          {detail && tab === "last-run" && <LastRunTab detail={detail} />}
          {detail && tab === "history" && <HistoryTab detail={detail} />}
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-bg-elev/40">
          <span className="text-[10px] text-fg-dim font-mono break-all truncate" title={detail?.filePath}>
            {detail?.filePath}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                if (detail) {
                  setEditedContent(detail.rawContent);
                  setEditedModel(detail.preferredModel ?? "inherit");
                }
              }}
              disabled={!dirtyContent && !dirtyModel}
              className="text-[10px] uppercase tracking-[0.16em] px-3 py-1.5 rounded-sm border border-border bg-bg-card text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              revert
            </button>
            <button
              onClick={save}
              disabled={saving || (!dirtyContent && !dirtyModel)}
              className="text-[10px] uppercase tracking-[0.16em] px-3 py-1.5 rounded-sm border border-accent bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "saving…" : dirtyContent || dirtyModel ? "save changes" : "saved"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function OverviewTab({
  detail,
  editedModel,
  setEditedModel,
}: {
  detail: AgentDetail;
  editedModel: string | null;
  setEditedModel: (v: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <Field label="description">
        <p className="text-[13px] text-fg leading-relaxed">{detail.frontmatter.description ?? "—"}</p>
      </Field>

      <Field label="thinking model">
        <ModelPicker value={editedModel ?? "inherit"} onChange={setEditedModel} />
      </Field>

      <Field label="frontmatter">
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 text-[11px] tabular border border-border rounded-md overflow-hidden">
          {Object.entries(detail.frontmatter).map(([k, v], i, arr) => (
            <div key={k} className={cn("contents", i < arr.length - 1 && "[&>*]:border-b [&>*]:border-border/60")}>
              <dt className="py-2 pl-3 pr-2 text-fg-dim uppercase tracking-[0.14em] text-[9px] bg-bg/40">
                {k}
              </dt>
              <dd className="py-2 pr-3 text-fg-muted break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </Field>

      <Field label="filesystem">
        <div className="flex flex-col gap-1 text-[11px] text-fg-muted font-mono p-3 bg-bg/30 border border-border rounded-md">
          <span className="break-all">{detail.filePath}</span>
          {detail.isInsideObsidian && (
            <span className="text-info break-all">
              obsidian vault: {detail.obsidianVault} → {detail.obsidianRelPath}
            </span>
          )}
        </div>
      </Field>
    </div>
  );
}

function ModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const grouped: Record<string, typeof MODEL_OPTIONS> = { opus: [], sonnet: [], haiku: [], other: [] };
  for (const opt of MODEL_OPTIONS) {
    if (opt.value === "inherit") (grouped.other = grouped.other ?? []).push(opt);
    else grouped[opt.family]!.push(opt);
  }

  return (
    <div className="flex flex-col gap-3">
      {(["opus", "sonnet", "haiku", "other"] as const).map((family) => (
        <div key={family} className="flex items-start gap-3">
          <span className="text-[9px] uppercase tracking-[0.18em] text-fg-dim w-16 mt-1">{family}</span>
          <div className="flex flex-wrap gap-1.5">
            {(grouped[family] ?? []).map((opt) => {
              const active = value === opt.value;
              const familyColor =
                opt.family === "opus"
                  ? "border-accent/60 text-accent"
                  : opt.family === "sonnet"
                  ? "border-info/60 text-info"
                  : "border-success/60 text-success";
              return (
                <button
                  key={opt.value}
                  onClick={() => onChange(opt.value)}
                  className={cn(
                    "text-[10px] uppercase tracking-[0.14em] px-2.5 py-1.5 rounded-sm border bg-bg-card",
                    active ? `${familyColor} bg-bg-hover ring-1` : "border-border text-fg-muted hover:bg-bg-hover",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-fg-dim italic">
        Adds <code className="bg-bg-card px-1 rounded-sm">model:</code> field to frontmatter. Task-style agents use this directly; skills will adopt this once Claude supports per-skill model.
      </p>
    </div>
  );
}

function PersonalityTab({
  content,
  setContent,
  filePath,
}: {
  content: string;
  setContent: (v: string) => void;
  filePath: string;
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="text-[10px] text-fg-dim font-mono">{filePath}</div>
      <textarea
        ref={ref}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        className="flex-1 w-full font-mono text-[12px] leading-relaxed bg-bg p-3 border border-border rounded-md text-fg resize-none focus:outline-none focus:border-accent/60"
      />
      <div className="text-[10px] text-fg-dim">
        {content.length.toLocaleString()} characters · edits write directly to the file
      </div>
    </div>
  );
}

function LastRunTab({ detail }: { detail: AgentDetail }): JSX.Element {
  if (!detail.lastInvocation) {
    return (
      <div className="text-fg-dim text-xs italic">
        no recent invocation found in last 10 sessions for this project
      </div>
    );
  }
  const inv = detail.lastInvocation;
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[6.5rem_1fr_6.5rem_1fr] gap-x-5 gap-y-2.5 text-[11px] tabular border border-border rounded-md p-4 bg-bg/30">
        <Pair label="status" value={inv.status} accent={inv.status === "error" ? "danger" : inv.status === "running" ? "warning" : "success"} />
        <Pair label="model" value={inv.model} />
        <Pair label="started" value={`${relativeTime(inv.startedAt)} · ${new Date(inv.startedAt).toLocaleString()}`} />
        <Pair label="duration" value={formatDuration(inv.durationMs)} />
        <Pair label="session" value={inv.sessionId.slice(0, 8) + "…"} mono />
        <Pair label="tool_use_id" value={inv.toolUseId.slice(0, 12) + "…"} mono />
      </dl>

      <Field label="prompt sent to agent">
        <pre className="bg-bg p-3 border border-border rounded-md text-[11px] font-mono leading-relaxed text-fg-muted whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
          {inv.prompt || "(empty)"}
        </pre>
      </Field>

      {inv.outputPreview && (
        <Field label="agent response (preview)">
          <pre className="bg-bg p-3 border border-border rounded-md text-[11px] font-mono leading-relaxed text-fg-dim whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
            {inv.outputPreview}
          </pre>
        </Field>
      )}
    </div>
  );
}

function HistoryTab({ detail }: { detail: AgentDetail }): JSX.Element {
  const h = detail.history;
  if (!h.totalInvocations) {
    return <div className="text-fg-dim text-xs italic">no invocations recorded in last 25 sessions</div>;
  }
  const errorRate = h.totalInvocations > 0 ? (h.errorCount / h.totalInvocations) * 100 : 0;
  const maxDaily = Math.max(1, ...h.daily.map((d) => d.count));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-px bg-border rounded-md overflow-hidden">
        <Stat label="invocations" value={h.totalInvocations.toString()} />
        <Stat label="success" value={`${h.successCount}`} accent="success" />
        <Stat label="errors" value={`${h.errorCount} (${errorRate.toFixed(0)}%)`} accent={h.errorCount > 0 ? "danger" : undefined} />
        <Stat label="avg / p95" value={`${formatDuration(h.avgDurationMs)} / ${formatDuration(h.p95DurationMs)}`} />
      </div>

      <Field label="last 14 days">
        <div className="flex items-end gap-1 h-20 bg-bg p-2 rounded-md border border-border">
          {h.daily.map((d) => {
            const heightPct = (d.count / maxDaily) * 100;
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col justify-end group relative min-w-0"
                title={`${d.day} · ${d.count} runs · ${d.errors} errors · avg ${formatDuration(d.avgMs)}`}
              >
                <div
                  className={cn(
                    "rounded-sm transition-colors",
                    d.errors > 0 ? "bg-danger/60 group-hover:bg-danger" : "bg-accent/40 group-hover:bg-accent",
                  )}
                  style={{ height: `${Math.max(heightPct, d.count > 0 ? 4 : 0)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] text-fg-dim tabular mt-1">
          <span>{h.daily[0]?.day}</span>
          <span>{h.daily[h.daily.length - 1]?.day}</span>
        </div>
      </Field>

      <Field label="recent invocations">
        <div className="overflow-y-auto max-h-72 border border-border rounded-md">
          <table className="w-full text-[11px] tabular">
            <thead className="bg-bg-elev/40 text-fg-dim uppercase tracking-[0.14em] text-[9px] sticky top-0">
              <tr>
                <th className="text-left px-3 py-1.5">when</th>
                <th className="text-left px-3 py-1.5">status</th>
                <th className="text-left px-3 py-1.5">model</th>
                <th className="text-right px-3 py-1.5">duration</th>
                <th className="text-left px-3 py-1.5">prompt</th>
              </tr>
            </thead>
            <tbody>
              {h.entries.map((e) => (
                <tr key={e.toolUseId} className="border-t border-border/40 hover:bg-bg-hover/40">
                  <td className="px-3 py-1.5 text-fg-muted whitespace-nowrap">{relativeTime(e.startedAt)}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "uppercase tracking-[0.14em] text-[9px]",
                        e.status === "done" && "text-success",
                        e.status === "error" && "text-danger",
                        e.status === "running" && "text-warning",
                      )}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-fg-dim">{e.model.replace(/^claude-/, "")}</td>
                  <td className="px-3 py-1.5 text-right text-fg-muted">{formatDuration(e.durationMs)}</td>
                  <td className="px-3 py-1.5 text-fg-dim truncate max-w-xs">{e.promptPreview || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Field>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger" | "warning";
}): JSX.Element {
  return (
    <div className="bg-bg p-3 flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.18em] text-fg-dim">{label}</span>
      <span
        className={cn(
          "text-lg font-semibold tabular",
          accent === "success" && "text-success",
          accent === "danger" && "text-danger",
          accent === "warning" && "text-warning",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">{label}</span>
      {children}
    </section>
  );
}

function Pair({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: "warning" | "success" | "danger";
  mono?: boolean;
}): JSX.Element {
  return (
    <>
      <dt className="text-fg-dim uppercase tracking-[0.14em] text-[9px] self-center">
        {label}
      </dt>
      <dd
        className={cn(
          "text-fg truncate min-w-0 self-center",
          mono && "font-mono text-[10.5px]",
          accent === "warning" && "text-warning",
          accent === "success" && "text-success",
          accent === "danger" && "text-danger",
        )}
        title={value}
      >
        {value}
      </dd>
    </>
  );
}
