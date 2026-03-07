import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportSeriesInput } from "@/lib/importers/mal";

const mocks = vi.hoisted(() => {
  const writeFileSyncMock = vi.fn();
  const runImportInsertMock = vi.fn();
  const prepareMock = vi.fn(() => ({ run: runImportInsertMock }));
  const getDbMock = vi.fn(() => ({ prepare: prepareMock }));
  const enqueueImportEnrichmentJobsMock = vi.fn(() => 0);
  const mergeSeriesByTitleMock = vi.fn((item: ImportSeriesInput) => ({
    type: "added" as const,
    series: { id: `id-${item.title}` },
  }));

  return {
    writeFileSyncMock,
    runImportInsertMock,
    prepareMock,
    getDbMock,
    enqueueImportEnrichmentJobsMock,
    mergeSeriesByTitleMock,
  };
});

vi.mock("node:fs", () => ({
  default: {
    writeFileSync: mocks.writeFileSyncMock,
  },
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDbMock,
}));

vi.mock("@/lib/db/storage", () => ({
  dataPaths: {
    importsDir: "/tmp/imports",
  },
}));

vi.mock("@/lib/enrichment/queue", () => ({
  enqueueImportEnrichmentJobs: mocks.enqueueImportEnrichmentJobsMock,
}));

vi.mock(
  "@/lib/series-repository",
  () => ({
    batchMergeSeriesByTitle: vi.fn(() => ({ added: 0, merged: 0 })),
    mergeSeriesByTitle: mocks.mergeSeriesByTitleMock,
  }),
  { virtual: true },
);

import { getImportPreview, runImport } from "./handler";

function makeItem(title: string): ImportSeriesInput {
  return {
    title,
    totalChapters: 100,
    chaptersRead: 10,
    startDate: null,
    finishDate: null,
    rating: null,
    status: "reading",
    personalNotes: "",
    reread: false,
    novelToRead: false,
    followUpdates: true,
    preferredSourceType: null,
    sources: [],
  };
}

describe("import-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns indexed preview items from parser output", () => {
    const parser = () => [makeItem("A"), makeItem("B")];

    const preview = getImportPreview("ignored", parser);

    expect(preview).toEqual([
      {
        index: 0,
        title: "A",
        status: "reading",
        totalChapters: 100,
        chaptersRead: 10,
      },
      {
        index: 1,
        title: "B",
        status: "reading",
        totalChapters: 100,
        chaptersRead: 10,
      },
    ]);
  });

  it("filters by selected indices before merge for website imports", async () => {
    const parser = () => [makeItem("A"), makeItem("B"), makeItem("C")];
    const mergeStrategy = vi.fn(() => ({ added: 2, merged: 0 }));

    await runImport("website", "payload", parser, "json", mergeStrategy, {
      selectedIndices: [0, 2],
    });

    expect(mocks.enqueueImportEnrichmentJobsMock).not.toHaveBeenCalled();
    expect(mergeStrategy).toHaveBeenCalledTimes(1);
    expect(mergeStrategy).toHaveBeenCalledWith([makeItem("A"), makeItem("C")]);
    expect(mocks.writeFileSyncMock).toHaveBeenCalledTimes(1);
    expect(mocks.prepareMock).toHaveBeenCalledWith(
      "INSERT INTO imports (id, source, file_name, added, merged, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
  });

  it("applies selection first and then enqueues MAL enrichment jobs", async () => {
    const parser = () => [makeItem("A"), makeItem("B"), makeItem("C")];
    mocks.enqueueImportEnrichmentJobsMock.mockReturnValueOnce(1);

    const result = await runImport("mal", "xml", parser, "xml", undefined, {
      selectedIndices: [1],
    });

    expect(mocks.mergeSeriesByTitleMock).toHaveBeenCalledTimes(1);
    expect(mocks.mergeSeriesByTitleMock).toHaveBeenCalledWith(makeItem("B"));
    expect(mocks.enqueueImportEnrichmentJobsMock).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueImportEnrichmentJobsMock).toHaveBeenCalledWith("mal", ["id-B"]);
    expect(result.queuedEnrichment).toBe(1);
  });
});
