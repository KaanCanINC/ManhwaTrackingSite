const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_COVER_BYTES = 6 * 1024 * 1024;
const COVER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export type DownloadedCoverImage = {
  blob: Uint8Array;
  mimeType: string;
  fetchedAt: string;
};

function normalizeMimeType(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.split(";")[0]?.trim().toLowerCase() || "";
  return value || null;
}

async function downloadCoverViaHttp(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<DownloadedCoverImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers,
    });

    if (!response.ok) {
      return null;
    }

    const mimeType = normalizeMimeType(response.headers.get("content-type"));
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return null;
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_COVER_BYTES) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    const blob = new Uint8Array(buffer);

    if (blob.byteLength === 0 || blob.byteLength > MAX_COVER_BYTES) {
      return null;
    }

    return {
      blob,
      mimeType,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function screenshotCoverFromSourcePage(
  sourceUrl: string,
  timeoutMs: number,
): Promise<DownloadedCoverImage | null> {
  try {
    const puppeteerModule = await import("puppeteer");
    const browser = await puppeteerModule.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(COVER_USER_AGENT);
      await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: timeoutMs });

      const selectors = [
        ".summary_image img",
        "img[itemprop='image']",
        "img[class*='summary'][class*='image']",
        "img[class*='cover']",
        "article img",
      ];

      for (const selector of selectors) {
        const element = await page.$(selector);
        if (!element) continue;

        const box = await element.boundingBox();
        if (!box || box.width < 80 || box.height < 100) {
          continue;
        }

        const shot = await element.screenshot({ type: "png" });
        const blob = new Uint8Array(shot);
        if (blob.byteLength === 0 || blob.byteLength > MAX_COVER_BYTES) {
          continue;
        }

        return {
          blob,
          mimeType: "image/png",
          fetchedAt: new Date().toISOString(),
        };
      }

      return null;
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

export async function tryDownloadCoverImage(
  rawUrl: string | null,
  sourceUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DownloadedCoverImage | null> {
  if (!rawUrl) {
    return null;
  }

  let resolvedUrl: string;
  let sourceOrigin: string | null = null;
  try {
    resolvedUrl = new URL(rawUrl, sourceUrl).toString();
    sourceOrigin = new URL(sourceUrl).origin;
  } catch {
    return null;
  }

  const headers: Record<string, string> = {
    "User-Agent": COVER_USER_AGENT,
    Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
    Referer: sourceUrl,
  };
  if (sourceOrigin) {
    headers.Origin = sourceOrigin;
  }

  const direct = await downloadCoverViaHttp(resolvedUrl, headers, timeoutMs);
  if (direct) {
    return direct;
  }

  const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(resolvedUrl)}&output=webp`;
  const proxied = await downloadCoverViaHttp(proxiedUrl, headers, timeoutMs);
  if (proxied) {
    return proxied;
  }

  return await screenshotCoverFromSourcePage(sourceUrl, timeoutMs);
}
