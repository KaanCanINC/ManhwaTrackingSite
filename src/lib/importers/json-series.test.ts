import { describe, expect, it } from "vitest";
import { parseAnilistOrSeriesJsonImport, parseSeriesJsonImport } from "@/lib/importers/json-series";

describe("json series importer", () => {
  it("parses backup snapshot JSON", () => {
    const content = JSON.stringify({
      createdAt: "2026-05-20T12:00:00.000Z",
      reason: "manual",
      series: [
        {
          title: "Tower of God",
          totalChapters: 700,
          chaptersRead: 200,
          status: "reading",
          personalNotes: "great",
          followUpdates: true,
          sources: [{ type: "EN", url: "https://example.com/tog" }],
        },
      ],
    });

    const parsed = parseSeriesJsonImport(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe("Tower of God");
    expect(parsed[0]?.sources).toHaveLength(1);
    expect(parsed[0]?.status).toBe("reading");
  });

  it("parses full export shape with data.series", () => {
    const content = JSON.stringify({
      data: {
        exportedAt: "2026-05-20T12:00:00.000Z",
        series: [
          {
            title: "Solo Leveling",
            totalChapters: 200,
            chaptersRead: 200,
            status: "completed",
          },
        ],
      },
    });

    const parsed = parseSeriesJsonImport(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe("Solo Leveling");
    expect(parsed[0]?.status).toBe("completed");
  });

  it("parses AniList JSON via fallback helper", () => {
    const content = JSON.stringify([
      {
        title: "Omniscient Reader",
        progress: 12,
        episodes: 200,
        score: 90,
        status: "CURRENT",
      },
    ]);

    const parsed = parseAnilistOrSeriesJsonImport(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe("Omniscient Reader");
    expect(parsed[0]?.status).toBe("reading");
    expect(parsed[0]?.rating).toBe(9);
  });
});