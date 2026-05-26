import { useMemo } from "react";
import useSWR from "swr";
import type { EnrichmentStats } from "@/lib/contracts";
import type { Series, SeriesStatus } from "@/lib/types";
import { clampInt } from "@/utils/ui-utils";

type FlagFilter = "none" | "reread" | "novel" | "follow";

type EnrichmentStatsResponse = {
  data: EnrichmentStats;
};

type OperationMetaResponse = {
  meta?: {
    operationId?: string;
  };
};

type SeriesPayload = {
  data?: Series[];
  meta?: { statusCounts?: Record<string, number> };
};

const defaultEnrichmentStats: EnrichmentStats = {
  pending: 0,
  running: 0,
  failed: 0,
  done: 0,
};

function withSeriesData(
  payload: SeriesPayload | undefined,
  update: (items: Series[]) => Series[],
): SeriesPayload | undefined {
  if (!payload?.data) {
    return payload;
  }

  return {
    ...payload,
    data: update(payload.data),
  };
}

function withSeriesDataSafe(
  payload: SeriesPayload | undefined,
  update: (items: Series[]) => Series[],
): SeriesPayload {
  return {
    ...(payload ?? {}),
    data: update(payload?.data ?? []),
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${url}`);
  }
  return (await res.json()) as T;
}

function toSeriesKey(
  query: string,
  status: SeriesStatus | "all",
  flag: FlagFilter,
): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("query", query.trim());
  if (status !== "all") params.set("status", status);
  if (flag === "reread") params.set("reread", "true");
  if (flag === "novel") params.set("novelToRead", "true");
  if (flag === "follow") params.set("followUpdates", "true");

  const suffix = params.toString();
  return suffix ? `/api/series?${suffix}` : "/api/series";
}

export function useLibraryData(
  query: string,
  statusFilter: SeriesStatus | "all",
  flagFilter: FlagFilter,
) {
  const seriesKey = useMemo(
    () => toSeriesKey(query, statusFilter, flagFilter),
    [query, statusFilter, flagFilter],
  );

  const {
    data: seriesPayload,
    mutate: mutateSeries,
    isLoading: seriesLoading,
  } = useSWR<SeriesPayload>(seriesKey, fetchJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const hasPending = (seriesPayload?.data ?? []).some(
    (item) => item.enrichmentStatus === "pending" || item.enrichmentStatus === "running",
  );

  const { data: statsPayload, mutate: mutateStats } = useSWR<EnrichmentStatsResponse>(
    "/api/import/enrichment/stats",
    fetchJson,
    {
      refreshInterval: hasPending ? 5000 : 0,
      revalidateOnFocus: false,
    },
  );

  const items = seriesPayload?.data ?? [];
  const statusCounts = seriesPayload?.meta?.statusCounts ?? {};
  const enrichmentStats = statsPayload?.data ?? defaultEnrichmentStats;

  async function updateChapterOptimistic(id: string, delta: number): Promise<string | null> {
    let operationId: string | null = null;
    try {
      await mutateSeries(
        async (current) => {
          const item = current?.data?.find((entry) => entry.id === id);
          if (!item) {
            return current;
          }

          const next = clampInt(item.chaptersRead + delta);
          const res = await fetch(`/api/series/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chaptersRead: next }),
          });

          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error || "Chapter update failed.");
          }

          const json = (await res.json()) as { data: Series } & OperationMetaResponse;
          operationId = json.meta?.operationId ?? null;
          return withSeriesData(current, (entries) =>
            entries.map((entry) => (entry.id === id ? json.data : entry)),
          );
        },
        {
          optimisticData: (current) =>
            withSeriesDataSafe(current, (entries) =>
              entries.map((entry) =>
                entry.id === id
                  ? { ...entry, chaptersRead: clampInt(entry.chaptersRead + delta) }
                  : entry,
              ),
            ),
          rollbackOnError: true,
          revalidate: false,
        },
      );

      // Keep status counts and server-derived values authoritative after optimistic write.
      void mutateSeries();
      return operationId;
    } catch (error) {
      throw new Error(toErrorMessage(error, "Chapter update failed."));
    }
  }

  async function deleteSeriesOptimistic(id: string): Promise<string | null> {
    let operationId: string | null = null;
    try {
      await mutateSeries(
        async (current) => {
          const exists = current?.data?.some((entry) => entry.id === id);
          if (!exists) {
            return current;
          }

          const res = await fetch(`/api/series/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error || "Delete failed.");
          }

          const json = (await res.json().catch(() => ({}))) as OperationMetaResponse;
          operationId = json.meta?.operationId ?? null;

          return current;
        },
        {
          optimisticData: (current) =>
            withSeriesDataSafe(current, (entries) => entries.filter((entry) => entry.id !== id)),
          rollbackOnError: true,
          revalidate: false,
        },
      );

      // Revalidate in background to reconcile counts and server-generated metadata.
      void mutateSeries();
      return operationId;
    } catch (error) {
      throw new Error(toErrorMessage(error, "Delete failed."));
    }
  }

  async function refresh(): Promise<void> {
    await Promise.all([mutateSeries(), mutateStats()]);
  }

  return {
    items,
    statusCounts,
    enrichmentStats,
    loading: seriesLoading && !seriesPayload,
    refresh,
    mutateSeries,
    updateChapterOptimistic,
    deleteSeriesOptimistic,
  };
}
