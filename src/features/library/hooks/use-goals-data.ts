import useSWR from "swr";
import type { GoalConfig, GoalMetricType, GoalProgressSummary } from "@/lib/contracts";

type GoalsResponse = {
  data: GoalConfig[];
};

type GoalsSummaryResponse = {
  data: {
    weeklyChapter: GoalProgressSummary | null;
    monthlyChapter: GoalProgressSummary | null;
    monthlyCompleted: GoalProgressSummary | null;
  };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${url}`);
  }
  return (await res.json()) as T;
}

function toPeriod(metricType: GoalMetricType): "week" | "month" {
  return metricType === "weekly_chapter_goal" ? "week" : "month";
}

function periodRange(period: "week" | "month"): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  if (period === "week") {
    const day = start.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diffToMonday);
  } else {
    start.setDate(1);
  }
  start.setHours(0, 0, 0, 0);

  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export function useGoalsData() {
  const { data: goalsPayload, mutate: mutateGoals, isLoading: goalsLoading } = useSWR<GoalsResponse>(
    "/api/goals",
    fetchJson,
    { revalidateOnFocus: false },
  );

  const {
    data: summaryPayload,
    mutate: mutateSummary,
    isLoading: summaryLoading,
  } = useSWR<GoalsSummaryResponse>("/api/goals/summary", fetchJson, {
    refreshInterval: 20000,
    revalidateOnFocus: false,
  });

  const goals = goalsPayload?.data ?? [];
  const summary = summaryPayload?.data ?? {
    weeklyChapter: null,
    monthlyChapter: null,
    monthlyCompleted: null,
  };

  async function upsertGoal(metricType: GoalMetricType, targetValue: number) {
    const existing = goals.find((goal) => goal.metricType === metricType);
    const periodType = toPeriod(metricType);
    const range = periodRange(periodType);

    if (existing) {
      const res = await fetch(`/api/goals/${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetValue,
          startDate: range.startDate,
          endDate: range.endDate,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to update goal.");
      }
    } else {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodType,
          metricType,
          targetValue,
          startDate: range.startDate,
          endDate: range.endDate,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to create goal.");
      }
    }

    await Promise.all([mutateGoals(), mutateSummary()]);
  }

  async function removeGoal(metricType: GoalMetricType) {
    const existing = goals.find((goal) => goal.metricType === metricType);
    if (!existing) {
      return;
    }

    const res = await fetch(`/api/goals/${existing.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "Failed to delete goal.");
    }

    await Promise.all([mutateGoals(), mutateSummary()]);
  }

  async function refresh() {
    await Promise.all([mutateGoals(), mutateSummary()]);
  }

  return {
    goals,
    summary,
    loading: (goalsLoading && !goalsPayload) || (summaryLoading && !summaryPayload),
    upsertGoal,
    removeGoal,
    refresh,
  };
}
