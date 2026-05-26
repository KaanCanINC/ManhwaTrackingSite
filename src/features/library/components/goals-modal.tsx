import { FormEvent, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { GoalConfig, GoalMetricType } from "@/lib/contracts";

type Props = {
  goals: GoalConfig[];
  onClose: () => void;
  onSave: (metric: GoalMetricType, target: number) => Promise<void>;
  onRemove: (metric: GoalMetricType) => Promise<void>;
};

function metricLabel(metric: GoalMetricType): string {
  if (metric === "weekly_chapter_goal") return "Weekly Chapter Goal";
  if (metric === "monthly_chapter_goal") return "Monthly Chapter Goal";
  return "Monthly Completed Goal";
}

function toInitialTarget(goals: GoalConfig[], metricType: GoalMetricType): string {
  const found = goals.find((goal) => goal.metricType === metricType);
  return found ? String(found.targetValue) : "";
}

export function GoalsModal({ goals, onClose, onSave, onRemove }: Props) {
  const [weeklyTarget, setWeeklyTarget] = useState(toInitialTarget(goals, "weekly_chapter_goal"));
  const [monthlyTarget, setMonthlyTarget] = useState(toInitialTarget(goals, "monthly_chapter_goal"));
  const [monthlyCompletedTarget, setMonthlyCompletedTarget] = useState(
    toInitialTarget(goals, "monthly_completed_goal"),
  );
  const [busyMetric, setBusyMetric] = useState<GoalMetricType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = useMemo(
    () => [
      {
        metric: "weekly_chapter_goal" as const,
        value: weeklyTarget,
        setter: setWeeklyTarget,
      },
      {
        metric: "monthly_chapter_goal" as const,
        value: monthlyTarget,
        setter: setMonthlyTarget,
      },
      {
        metric: "monthly_completed_goal" as const,
        value: monthlyCompletedTarget,
        setter: setMonthlyCompletedTarget,
      },
    ],
    [weeklyTarget, monthlyTarget, monthlyCompletedTarget],
  );

  async function submitMetric(e: FormEvent, metric: GoalMetricType, value: string) {
    e.preventDefault();
    setError(null);

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      setError("Goal target must be a positive integer.");
      return;
    }

    setBusyMetric(metric);
    try {
      await onSave(metric, parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal.");
    } finally {
      setBusyMetric(null);
    }
  }

  async function removeMetric(metric: GoalMetricType) {
    setError(null);
    setBusyMetric(metric);
    try {
      await onRemove(metric);
      if (metric === "weekly_chapter_goal") setWeeklyTarget("");
      if (metric === "monthly_chapter_goal") setMonthlyTarget("");
      if (metric === "monthly_completed_goal") setMonthlyCompletedTarget("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove goal.");
    } finally {
      setBusyMetric(null);
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Goal Settings</h3>
          <button
            onClick={onClose}
            className="text-gray-500 transition-colors hover:text-white"
            aria-label="Close goals modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {config.map((entry) => (
            <form
              key={entry.metric}
              onSubmit={(e) => void submitMetric(e, entry.metric, entry.value)}
              className="rounded-lg border border-gray-800 bg-gray-950/40 p-3"
            >
              <label className="block text-xs text-gray-400">
                {metricLabel(entry.metric)}
                <input
                  value={entry.value}
                  onChange={(e) => entry.setter(e.target.value)}
                  inputMode="numeric"
                  placeholder="Target"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
              </label>

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void removeMetric(entry.metric)}
                  disabled={busyMetric === entry.metric}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
                >
                  Remove
                </button>
                <button
                  type="submit"
                  disabled={busyMetric === entry.metric}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {busyMetric === entry.metric ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          ))}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
