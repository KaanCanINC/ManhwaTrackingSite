import { describe, expect, it } from "vitest";
import { extractDescription, extractTitle, extractTotalChapters, sanitizeTitle } from "./html-utils";

describe("scraper html utils", () => {
  it("sanitizes known site suffixes from title", () => {
    expect(sanitizeTitle("Yuce Topuz Tarikati - Golge Bahcesi")).toBe("Yuce Topuz Tarikati");
    expect(sanitizeTitle("Solo Leveling - Serein Scan")).toBe("Solo Leveling");
    expect(sanitizeTitle("Test | MerlinToon")).toBe("Test");
    expect(sanitizeTitle("Something oku - Manhwa ve Manhua okumak icin tikla.")).toBe("Something");
  });

  it("extracts title and description from json-ld over weak meta", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Weak Site Title - Manga" />
          <meta property="og:description" content="Manga oku webtoon oku" />
          <script type="application/ld+json">
            {"@type":"ComicStory","name":"Real Series Title","description":"Real synopsis content for test title."}
          </script>
        </head>
      </html>
    `;

    expect(extractTitle(html)).toContain("Real Series Title");
    expect(extractDescription(html)).toContain("Real synopsis content");
  });

  it("extracts chapter count from bolum/chapter patterns", () => {
    const html = `
      <a href="/manga/foo/bolum-152/">Bölüm 152</a>
      <a href="/manga/foo/chapter-148/">Chapter 148</a>
      <a href="/manga/foo/episode-149/">Episode 149</a>
    `;

    expect(extractTotalChapters(html)).toBe(152);
  });
});
