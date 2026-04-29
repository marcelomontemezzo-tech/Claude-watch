import type { ProjectSummary } from "@shared/types.ts";
import { cn, formatCost } from "../lib/utils.ts";

export function BudgetBar({ project }: { project: ProjectSummary }): JSX.Element | null {
  const budget = project.budget;
  if (!budget || budget.monthly <= 0) return null;
  const monthCost = project.monthCost ?? 0;
  const ratio = Math.min(monthCost / budget.monthly, 1.5);
  const widthPct = Math.min(ratio * 100, 100);
  const state = project.budgetState ?? "under";
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-fg-dim tabular">
        <span>budget</span>
        <span
          className={cn(
            state === "over" && "text-danger",
            state === "near" && "text-warning",
            state === "under" && "text-fg-muted",
          )}
        >
          {formatCost(monthCost)} / {formatCost(budget.monthly)}
        </span>
      </div>
      <div className="mt-1 h-[3px] w-full bg-bg-elev/60 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-[width] duration-500",
            state === "over" && "bg-danger",
            state === "near" && "bg-warning",
            state === "under" && "bg-success/70",
          )}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
