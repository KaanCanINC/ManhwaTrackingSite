import type { PreferredSourceType, SeriesContentType, SeriesStatus } from "@/lib/types";
import type { ImportSeriesInput } from "@/lib/importers/mal";
import { parseAnilistExport } from "@/lib/importers/anilist";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function toStatus(value: unknown): SeriesStatus {
  if (typeof value !== "string") {
    return "plan_to_read";
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "plan_to_read" ||
    normalized === "reading" ||
    normalized === "completed" ||
    normalized === "dropped" ||
    normalized === "up_to_date"
  ) {
    return normalized;
  }

  return "plan_to_read";
}

function toPreferredSource(value: unknown): PreferredSourceType | null {
  if (typeof value !== "string") {
    return null;
  }
  if (value === "TR" || value === "EN" || value === "MAL" || value === "ANILIST" || value === "CUSTOM") {
    return value;
  }
  return null;
}

function toContentType(value: unknown): SeriesContentType | null {
  if (value === "MANHWA" || value === "MANHUA" || value === "MANGA") {
    return value;
  }
  return null;
}

function toNonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function toNullableDateString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNullableRating(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function toNullableHttpUrl(value: unknown): string | null {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

function toStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value;
}

function toSourceMetaRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return record;
}

function toSources(value: unknown): ImportSeriesInput["sources"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: ImportSeriesInput["sources"] = [];

  for (const item of value) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const type = record.type;
    const rawUrl = toNullableString(record.url);

    if ((type !== "TR" && type !== "EN") || !rawUrl) {
      continue;
    }

    try {
      const normalizedUrl = new URL(rawUrl).toString();
      output.push({
        type,
        url: normalizedUrl,
        site: toNullableString(record.site),
        canonicalId: toNullableString(record.canonicalId),
        scrapedAt: toNullableDateString(record.scrapedAt),
        scraperName: toNullableString(record.scraperName),
        lastError: (() => {
          const rawError = asRecord(record.lastError);
          if (!rawError) return null;
          const message = toNullableString(rawError.message);
          const timestamp = toNullableString(rawError.timestamp);
          if (!message || !timestamp) return null;
          return { message, timestamp };
        })(),
        meta: toSourceMetaRecord(record.meta),
      });
    } catch {
      // Ignore invalid source URLs so a single bad row does not block import.
    }
  }

  return output;
}

function extractSeriesArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  const root = asRecord(parsed);
  if (!root) {
    return [];
  }

  if (Array.isArray(root.series)) {
    return root.series;
  }

  const data = asRecord(root.data);
  if (data && Array.isArray(data.series)) {
    return data.series;
  }

  return [];
}

export function parseSeriesJsonImport(content: string): ImportSeriesInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Invalid JSON format");
  }

  const entries = extractSeriesArray(parsed);

  const mapped: ImportSeriesInput[] = [];

  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const title = toStringOrEmpty(record.title).trim();
    if (!title) {
      continue;
    }

    mapped.push({
      title,
      totalChapters: toNonNegativeInt(record.totalChapters),
      chaptersRead: toNonNegativeInt(record.chaptersRead),
      startDate: toNullableDateString(record.startDate),
      finishDate: toNullableDateString(record.finishDate),
      rating: toNullableRating(record.rating),
      description: toStringOrEmpty(record.description),
      personalNotes: toStringOrEmpty(record.personalNotes),
      status: toStatus(record.status),
      contentType: toContentType(record.contentType),
      reread: toBoolean(record.reread, false),
      novelToRead: toBoolean(record.novelToRead, false),
      followUpdates: toBoolean(record.followUpdates, true),
      preferredSourceType: toPreferredSource(record.preferredSourceType),
      coverImageBlob: null,
      coverImageMimeType: null,
      coverImageFetchedAt: null,
      metadataFetchedAt: toNullableDateString(record.metadataFetchedAt),
      metadataSourceUrl: toNullableHttpUrl(record.metadataSourceUrl),
      metadataSourceSite:
        record.metadataSourceSite === "myanimelist" || record.metadataSourceSite === "anilist"
          ? record.metadataSourceSite
          : null,
      metadataSourceCanonicalId: toNullableString(record.metadataSourceCanonicalId),
      metadataSourceUpdatedAt: toNullableDateString(record.metadataSourceUpdatedAt),
      sources: toSources(record.sources),
    });
  }

  if (mapped.length === 0) {
    throw new Error("Unsupported JSON import format. Use backup/full-export JSON with a series array.");
  }

  return mapped;
}

export function parseAnilistOrSeriesJsonImport(content: string): ImportSeriesInput[] {
  try {
    const items = parseAnilistExport(content);
    if (items.length > 0) {
      return items;
    }
  } catch {
    // Fall back to generic JSON import parser below.
  }

  return parseSeriesJsonImport(content);
}