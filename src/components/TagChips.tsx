import { useDashboard } from "../hooks/useDashboard.ts";
import { cn } from "../lib/utils.ts";

export function TagChips({ tags }: { tags: string[] | undefined }): JSX.Element | null {
  const tagFilter = useDashboard((s) => s.tagFilter);
  const setTagFilter = useDashboard((s) => s.setTagFilter);
  if (!tags || tags.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((t) => {
        const active = tagFilter === t;
        return (
          <button
            key={t}
            onClick={(e) => {
              e.stopPropagation();
              setTagFilter(active ? null : t);
            }}
            className={cn(
              "text-[8px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm border transition-colors",
              active
                ? "bg-accent/15 border-accent/60 text-accent"
                : "bg-bg-elev/60 border-border text-fg-muted hover:border-fg-muted hover:text-fg",
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
