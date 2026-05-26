import { Target } from "lucide-react";
import type { GoalProgressSummary } from "@/lib/contracts";

function labelForMetric(metricType: GoalProgressSummary["metricType"]): string {
  if (metricType === "weekly_chapter_goal") return "Weekly Chapters";
  if (metricType === "monthly_chapter_goal") return "Monthly Chapters";
  return "Monthly Completed";
}

function GoalCard({ summary }: { summary: GoalProgressSummary }) {
  const percent = Math.max(0, Math.min(100, summary.percent));
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3">
      <p className="text-xs text-gray-400">{labelForMetric(summary.metricType)}</p>
      <p className="mt-1 text-lg font-medium text-white">
        {summary.actualValue} / {summary.targetValue}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
        <span>Remaining: {summary.remainingValue}</span>
        {summary.metricType !== "monthly_completed_goal" && (
          <span>4W Avg: {summary.trendLast4Avg.toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}

type Props = {
  weeklyChapter: GoalProgressSummary | null;
  monthlyChapter: GoalProgressSummary | null;
  monthlyCompleted: GoalProgressSummary | null;
  onOpenGoalsModal: () => void;
};

export function GoalsPanel({
  weeklyChapter,
  monthlyChapter,
  monthlyCompleted,
  onOpenGoalsModal,
}: Props) {
  const hasAny = Boolean(weeklyChapter || monthlyChapter || monthlyCompleted);

  return (
    <div className="mb-4 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-gray-100">
          <Target className="h-4 w-4" />
          Goals & Progress
        </h3>
        <button
          onClick={onOpenGoalsModal}
          className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-blue-500 hover:text-white"
        >
          Edit Goals
        </button>
      </div>

      {!hasAny ? (
        <p className="text-xs text-gray-500">No goals yet. Add your first target.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {weeklyChapter && <GoalCard summary={weeklyChapter} />}
          {monthlyChapter && <GoalCard summary={monthlyChapter} />}
          {monthlyCompleted && <GoalCard summary={monthlyCompleted} />}
        </div>
      )}
    </div>
  );
}
