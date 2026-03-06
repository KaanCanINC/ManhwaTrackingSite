const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_COVER_BYTES = 6 * 1024 * 1024;

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

export async function tryDownloadCoverImage(
  rawUrl: string | null,
  sourceUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DownloadedCoverImage | null> {
  if (!rawUrl) {
    return null;
  }

  let resolvedUrl: string;
  try {
    resolvedUrl = new URL(rawUrl, sourceUrl).toString();
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resolvedUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
      },
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
