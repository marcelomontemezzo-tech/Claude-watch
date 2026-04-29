import { useDashboard } from "../hooks/useDashboard.ts";
import { cn, relativeTime } from "../lib/utils.ts";
import type { MemoryEntry } from "@shared/types.ts";

const KIND_BADGE: Record<MemoryEntry["kind"], string> = {
  user: "bg-accent/15 text-accent",
  feedback: "bg-warning/15 text-warning",
  project: "bg-info/15 text-info",
  reference: "bg-success/15 text-success",
  "claude-md": "bg-fg/10 text-fg",
  obsidian: "bg-fg-muted/15 text-fg-muted",
};

export function MemoryBank(): JSX.Element {
  const snapshot = useDashboard((s) => s.snapshot);
  const selected = useDashboard((s) => s.selectedProjectKey);
  const key = selected ?? snapshot?.activeProjectKey ?? null;
  const bank = key ? snapshot?.memoryByProject?.[key] : undefined;

  if (!bank || bank.totalEntries === 0) {
    return (
      <div className="grid h-full place-items-center text-fg-dim text-xs">
        No memory bank found for this project.
      </div>
    );
  }

  const claudeMd = bank.entries.find((e) => e.kind === "claude-md");
  const memoryEntries = bank.entries.filter(
    (e) => e.kind !== "obsidian" && e.kind !== "claude-md",
  );
  const obsidianEntries = bank.entries.filter((e) => e.kind === "obsidian");

  return (
    <div className="flex h-full overflow-y-auto">
      <div className="flex-1 grid grid-cols-3 gap-px bg-border min-h-full">
        <Section title="Auto memory" subtitle={`${memoryEntries.length} entries`} accent>
          {claudeMd && <MemoryCard entry={claudeMd} key={claudeMd.id} />}
          {memoryEntries.map((e) => (
            <MemoryCard entry={e} key={e.id} />
          ))}
          {memoryEntries.length === 0 && !claudeMd && (
            <p className="text-fg-dim text-xs italic">no claude-managed memory</p>
          )}
        </Section>

        <Section
          title="Obsidian vault"
          subtitle={bank.obsidianSummary ? `${bank.obsidianSummary.totalFiles} files` : "no vault"}
        >
          {bank.obsidianSummary && (
            <>
              <div className="text-[10px] text-fg-dim font-mono break-all mb-2 leading-relaxed">
                {bank.obsidianSummary.rootPath}
              </div>
              <ul className="flex flex-col gap-1">
                {bank.obsidianSummary.folders.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center justify-between rounded-sm px-2 py-1.5 bg-bg-card/60 text-xs"
                  >
                    <span className="truncate font-medium">{f.name}</span>
                    <span className="text-fg-dim tabular shrink-0 ml-2">{f.fileCount}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!bank.obsidianSummary && (
            <p className="text-fg-dim text-xs italic">no Obsidian vault detected</p>
          )}
        </Section>

        <Section title="Recent notes" subtitle={`${obsidianEntries.length}`}>
          {obsidianEntries.length === 0 && (
            <p className="text-fg-dim text-xs italic">no recent markdown</p>
          )}
          {obsidianEntries.map((e) => (
            <MemoryCard entry={e} key={e.id} compact />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: boolean;
}): JSX.Element {
  return (
    <section className={cn("p-4 bg-bg flex flex-col gap-3 min-h-full", accent && "bg-bg-elev/40")}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">{title}</span>
        {subtitle && <span className="text-[10px] text-fg-dim">{subtitle}</span>}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function MemoryCard({ entry, compact }: { entry: MemoryEntry; compact?: boolean }): JSX.Element {
  return (
    <article
      className={cn(
        "rounded-md border border-transparent bg-bg-card/60 hover:bg-bg-hover transition-colors",
        compact ? "px-2.5 py-1.5" : "px-3 py-2",
      )}
      title={entry.filePath}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              "text-[8px] uppercase tracking-[0.14em] px-1 py-px rounded-sm shrink-0",
              KIND_BADGE[entry.kind],
            )}
          >
            {entry.kind}
          </span>
          <span className="text-xs font-medium truncate">{entry.name}</span>
        </div>
        <span className="text-[9px] text-fg-dim tabular shrink-0">
          {relativeTime(entry.modifiedAt)}
        </span>
      </div>
      {entry.description && !compact && (
        <p className="mt-1 text-[10px] text-fg-muted line-clamp-2 leading-snug">
          {entry.description}
        </p>
      )}
      {entry.preview && !compact && !entry.description && (
        <p className="mt-1 text-[10px] text-fg-dim line-clamp-2 leading-snug font-mono">
          {entry.preview}
        </p>
      )}
    </article>
  );
}
