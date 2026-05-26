import { describe, expect, it } from "vitest";
import { resolveSiteByUrl } from "./domain-registry";

describe("resolveSiteByUrl", () => {
  it("resolves existing legacy sites", () => {
    expect(resolveSiteByUrl("https://asuracomic.net/manga/test").siteId).toBe("asuracomic");
    expect(resolveSiteByUrl("https://asurascans.com/manga/test").siteId).toBe("asuracomic");
    expect(resolveSiteByUrl("https://www.manhuaus.com/manga/test").siteId).toBe("manhuaus");
    expect(resolveSiteByUrl("https://asurascans.com.tr/seri/test").siteId).toBe("asurascans-tr");
  });

  it("resolves first-batch generic madara hosts", () => {
    expect(resolveSiteByUrl("https://www.golgebahcesi.com/manga/test").siteId).toBe("golgebahcesi-com");
    expect(resolveSiteByUrl("https://patimanga.com/manga/test").siteId).toBe("patimanga-com");
    expect(resolveSiteByUrl("https://ruyamanga.net/manga/test").siteId).toBe("ruyamanga-net");
    expect(resolveSiteByUrl("https://manga-sehri.net/manga/test").siteId).toBe("manga-sehri-net");
    expect(resolveSiteByUrl("https://sereinscan.net/manga/test").siteId).toBe("sereinscan-net");
    expect(resolveSiteByUrl("https://webtoonhatti.club/webtoon/test").siteId).toBe("webtoonhatti-club");
    expect(resolveSiteByUrl("https://demonicscans.org/manga/test").siteId).toBe("demonicscans-org");
    expect(resolveSiteByUrl("https://vortexscans.org/series/test").siteId).toBe("vortexscans-org");
    expect(resolveSiteByUrl("https://manhwaclan.co.uk/manga/test").siteId).toBe("manhwaclan-co-uk");
  });

  it("supports mirror hosts with shared site identity", () => {
    expect(resolveSiteByUrl("https://www.nabicix.com/manga/test").siteId).toBe("nabimanga-com");
    expect(resolveSiteByUrl("https://nabimanga.com/manga/test").siteId).toBe("nabimanga-com");
    expect(resolveSiteByUrl("https://manhwaclan.com/manga/test").siteId).toBe("manhwaclan-co-uk");
    expect(resolveSiteByUrl("https://www.manhwaclan.co.uk/manga/test").siteId).toBe("manhwaclan-co-uk");
    expect(resolveSiteByUrl("https://webtoonhattı.club/webtoon/test").siteId).toBe("webtoonhatti-club");
  });

  it("throws for unsupported domains", () => {
    expect(() => resolveSiteByUrl("https://example.com/manga/test")).toThrow("Unsupported domain: example.com");
  });
});
