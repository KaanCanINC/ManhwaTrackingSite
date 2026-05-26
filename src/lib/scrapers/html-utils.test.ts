import { describe, expect, it } from "vitest";
import {
  extractCoverImageUrl,
  extractDescription,
  extractTitle,
  extractTotalChapters,
  sanitizeTitle,
} from "./html-utils";

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

  it("prefers page heading over generic json-ld site name", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {"@type":"Organization","name":"Vortex Scans"}
          </script>
          <meta property="og:title" content="Series Name - Vortex" />
        </head>
        <body>
          <h1 class="entry-title">Reincarnated as the Youngest Son of a Demon Swordsman Family</h1>
        </body>
      </html>
    `;

    expect(extractTitle(html)).toContain("Reincarnated as the Youngest Son");
  });

  it("does not treat words containing 'ep' as chapter labels", () => {
    const html = `
      <script>
        const data = {"ePublished":"2026-05-16T19:43:38.275"};
      </script>
      <div>Chapter 16</div>
    `;

    expect(extractTotalChapters(html)).toBe(16);
  });

  it("extracts chapter count from query-param chapter links", () => {
    const html = `
      <a href="/chaptered.php?manga=13686&chapter=16">Chapter 16</a>
      <a href="/chaptered.php?manga=13686&chapter=15">Chapter 15</a>
    `;

    expect(extractTotalChapters(html)).toBe(16);
  });

  it("prefers og image when json-ld image is a site logo", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {"@type":"Organization","name":"Example","image":"https://example.com/logo.webp"}
          </script>
          <meta property="og:image" content="https://cdn.example.com/covers/series.webp" />
        </head>
      </html>
    `;

    expect(extractCoverImageUrl(html)).toBe("https://cdn.example.com/covers/series.webp");
  });

  it("ignores bare domain/challenge style titles", () => {
    const html = `
      <html>
        <head>
          <title>webtoonhatti.club</title>
          <meta property="og:title" content="Just a moment..." />
        </head>
      </html>
    `;

    expect(extractTitle(html)).toBe("");
  });
});
