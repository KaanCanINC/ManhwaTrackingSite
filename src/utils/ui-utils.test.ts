import { describe, expect, it } from "vitest";
import type { SeriesSource } from "@/lib/types";
import { getLibrarySourceLinks } from "@/utils/ui-utils";

function makeSource(overrides: Partial<SeriesSource>): SeriesSource {
  return {
    id: "src-1",
    seriesId: "series-1",
    type: "EN",
    url: "https://example.com/en",
    site: null,
    canonicalId: null,
    scrapedAt: null,
    scraperName: null,
    lastError: null,
    meta: null,
    ...overrides,
  };
}

describe("getLibrarySourceLinks", () => {
  it("returns TR and EN source links in expected order", () => {
    const links = getLibrarySourceLinks([
      makeSource({ id: "tr", type: "TR", url: "https://tr.site/series" }),
      makeSource({ id: "en", type: "EN", url: "https://en.site/series" }),
    ]);

    expect(links.map((item) => item.label)).toEqual(["TR", "EN"]);
    expect(links.map((item) => item.url)).toEqual(["https://tr.site/series", "https://en.site/series"]);
  });

  it("adds MAL button when metadata source is myanimelist", () => {
    const links = getLibrarySourceLinks([makeSource({ type: "EN" })], {
      site: "myanimelist",
      url: "https://myanimelist.net/manga/123",
    });

    expect(links.map((item) => item.label)).toEqual(["EN", "MAL"]);
    expect(links[1]?.url).toBe("https://myanimelist.net/manga/123");
  });

  it("adds ANILIST button when metadata source is anilist", () => {
    const links = getLibrarySourceLinks([], {
      site: "anilist",
      url: "https://anilist.co/manga/999",
    });

    expect(links).toEqual([
      {
        label: "ANILIST",
        title: "Open AniList",
        url: "https://anilist.co/manga/999",
      },
    ]);
  });

  it("ignores invalid source urls", () => {
    const links = getLibrarySourceLinks([
      makeSource({ type: "TR", url: "notaurl" }),
      makeSource({ type: "EN", url: "https://en.site/series" }),
    ], {
      site: "myanimelist",
      url: "bad-url",
    });

    expect(links).toEqual([
      {
        label: "EN",
        title: "Open English source",
        url: "https://en.site/series",
      },
    ]);
  });
});
