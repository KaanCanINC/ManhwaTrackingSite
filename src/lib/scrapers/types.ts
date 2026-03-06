import type { SourceType } from "@/lib/types";

export type ScraperSiteId = "asuracomic" | "manhuaus" | "asurascans-tr";

export interface ScrapedSeriesMetadata {
  title: string;
  description: string;
  coverImageUrl: string | null;
  tags: string[];
  alternativeTitles: string[];
  canonicalId: string | null;
  site: ScraperSiteId;
  sourceUrl: string;
  totalChapters: number | null;
}

export interface ScrapeRequest {
  url: string;
  sourceType: SourceType;
}

export interface ScraperContext {
  finalUrl: string;
  html: string;
}

export type SiteScraper = (ctx: ScraperContext) => ScrapedSeriesMetadata;
