import { useEffect, useState } from "react";
import type { EditorFile, EditorSource } from "@shared/types.ts";
import { cn, relativeTime } from "../lib/utils.ts";

export function EditorPane({
  source,
  onSaved,
}: {
  source: EditorSource | null;
  onSaved: (file: EditorFile) => void;
}): JSX.Element {
  const [file, setFile] = useState<EditorFile | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!source) {
      setFile(null);
      setDraft("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/editor/file?path=${encodeURIComponent(source.filePath)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<EditorFile>;
      })
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        setDraft(f.content);
      })
      .catch((e) => {
        if (!cancelled) setErr(String((e as Error).message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (!source) {
    return (
      <div className="grid h-full place-items-center text-fg-dim text-xs italic px-6 text-center">
        select a source on the left to edit
      </div>
    );
  }

  const dirty = file ? draft !== file.content : false;

  async function save(): Promise<void> {
    if (!source || source.readonly) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/editor/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: source.filePath, content: draft }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const updated = (await res.json()) as EditorFile;
      setFile(updated);
      setDraft(updated.content);
      setSavedAt(Date.now());
      onSaved(updated);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function revert(): void {
    if (!file) return;
    setDraft(file.content);
    setErr(null);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-border flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "text-[8px] uppercase tracking-[0.18em] px-1 py-0.5 rounded-sm border",
              tone(source),
            )}
          >
            {source.kind}
          </span>
          <span className="truncate text-sm font-medium">{source.name}</span>
          {source.readonly && (
            <span className="ml-auto text-[9px] uppercase tracking-[0.18em] text-fg-dim border border-border px-1.5 py-0.5 rounded-sm">
              read-only
            </span>
          )}
        </div>
        <div className="text-[10px] text-fg-dim tabular truncate" title={source.filePath}>
          {source.filePath}
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 grid place-items-center text-fg-dim text-xs italic">
            loading…
          </div>
        ) : err && !file ? (
          <div className="flex-1 grid place-items-center text-danger text-xs italic px-6 text-center">
            {err}
          </div>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            disabled={source.readonly}
            className={cn(
              "flex-1 font-mono text-[12px] leading-relaxed bg-bg p-4",
              "text-fg resize-none focus:outline-none",
              "disabled:opacity-70 disabled:cursor-not-allowed",
            )}
            style={{
              fontFamily:
                "var(--font-mono, ui-monospace, Menlo, Consolas, monospace)",
              tabSize: 2,
            }}
          />
        )}
      </div>

      <footer className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
        <div className="text-[10px] text-fg-dim tabular truncate">
          {dirty ? (
            <span className="text-warning">unsaved changes</span>
          ) : savedAt ? (
            <span>saved {relativeTime(savedAt)}</span>
          ) : (
            <span>up to date</span>
          )}
          {err && file && <span className="text-danger ml-2">· {err}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={revert}
            disabled={!dirty || saving}
            className="text-[10px] uppercase tracking-[0.18em] px-2.5 py-1.5 rounded-sm border border-border text-fg-muted hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            revert
          </button>
          <button
            onClick={() => void save()}
            disabled={!dirty || saving || source.readonly}
            className="text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded-sm bg-accent text-bg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "saving…" : "save"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function tone(s: EditorSource): string {
  switch (s.source) {
    case "project":
      return "border-accent/50 text-accent bg-accent/10";
    case "global":
      return "border-info/50 text-info bg-info/10";
    case "obsidian":
      return "border-warning/50 text-warning bg-warning/10";
    case "plugin":
      return "border-border text-fg-dim";
  }
}
