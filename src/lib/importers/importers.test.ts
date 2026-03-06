import { describe, expect, it } from "vitest";
import { parseAnilistExport } from "./anilist";
import { parseMalExport } from "./mal";

describe("importers", () => {
  it("parses MAL XML", () => {
    const xml = `<?xml version="1.0"?><myanimelist><manga><series_title>Solo Leveling</series_title><series_episodes>179</series_episodes><my_watched_episodes>120</my_watched_episodes><my_score>9</my_score><my_status>Reading</my_status></manga></myanimelist>`;
    const parsed = parseMalExport(xml);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Solo Leveling");
    expect(parsed[0].chaptersRead).toBe(120);
    expect(parsed[0].status).toBe("reading");
  });

  it("parses AniList JSON", () => {
    const raw = JSON.stringify([
      {
        title: "Omniscient Reader",
        progress: 200,
        score: 90,
        status: "CURRENT",
      },
    ]);

    const parsed = parseAnilistExport(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].rating).toBe(9);
    expect(parsed[0].status).toBe("reading");
  });
});
