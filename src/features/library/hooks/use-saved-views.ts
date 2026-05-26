import useSWR from "swr";
import type { SavedView } from "@/lib/contracts";
import type { SeriesStatus } from "@/lib/types";

type ViewsResponse = {
  data: SavedView[];
};

export type ViewStatePayload = {
  query: string;
  statusFilter: SeriesStatus | "all";
  flagFilter: "none" | "reread" | "novel" | "follow";
  viewMode: "grid" | "list";
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${url}`);
  }
  return (await res.json()) as T;
}

function parseViewState(input: Record<string, unknown> | null): ViewStatePayload | null {
  if (!input) {
    return null;
  }

  const status = input.statusFilter;
  const flag = input.flagFilter;
  const mode = input.viewMode;
  const query = input.query;

  if (
    typeof query !== "string" ||
    (status !== "all" &&
      status !== "plan_to_read" &&
      status !== "reading" &&
      status !== "completed" &&
      status !== "dropped" &&
      status !== "up_to_date") ||
    (flag !== "none" && flag !== "reread" && flag !== "novel" && flag !== "follow") ||
    (mode !== "grid" && mode !== "list")
  ) {
    return null;
  }

  return {
    query,
    statusFilter: status,
    flagFilter: flag,
    viewMode: mode,
  };
}

export function useSavedViews() {
  const {
    data: payload,
    mutate,
    isLoading,
  } = useSWR<ViewsResponse>("/api/views", fetchJson, {
    revalidateOnFocus: false,
  });

  const views = payload?.data ?? [];
  const collections = views.filter((view) => view.mode === "collection");

  async function createDynamicView(name: string, state: ViewStatePayload) {
    const res = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mode: "dynamic",
        query: state,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "Failed to create saved view.");
    }

    await mutate();
  }

  async function createCollectionView(name: string, seriesIds: string[]): Promise<SavedView> {
    const res = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mode: "collection",
        query: null,
        seriesIds,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "Failed to create collection.");
    }

    const json = (await res.json()) as { data: SavedView };
    await mutate();
    return json.data;
  }

  async function deleteView(id: string) {
    const res = await fetch(`/api/views/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "Failed to delete saved view.");
    }

    await mutate();
  }

  async function addItemsToCollection(collectionId: string, seriesIds: string[]) {
    const uniqueSeriesIds = Array.from(new Set(seriesIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueSeriesIds.length === 0) {
      return { inserted: 0, skipped: 0 };
    }

    const res = await fetch(`/api/views/${collectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesIds: uniqueSeriesIds }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "Failed to add series to collection.");
    }

    const json = (await res.json()) as { data?: { inserted?: number; skipped?: number } };
    await mutate();

    return {
      inserted: json.data?.inserted ?? uniqueSeriesIds.length,
      skipped: json.data?.skipped ?? 0,
    };
  }

  return {
    views,
    collections,
    loading: isLoading && !payload,
    refresh: mutate,
    createDynamicView,
    createCollectionView,
    deleteView,
    addItemsToCollection,
    parseViewState,
  };
}
