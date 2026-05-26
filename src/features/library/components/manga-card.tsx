import Image from "next/image";
import Link from "next/link";
import { BookOpen, Star, X } from "lucide-react";
import { MouseEvent } from "react";
import type { Series } from "@/lib/types";
import {
  coverGradient,
  formatStatus,
  getLibrarySourceLinks,
  getPreferredSource,
  parseSourceMeta,
  statusBg,
} from "@/utils/ui-utils";

type Props = {
  item: Series;
  collectionTags?: string[];
  onChapter: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
};

export function MangaCard({ item, collectionTags = [], onChapter, onDelete }: Props) {
  const preferredSource = getPreferredSource(item.sources, item.preferredSourceType, {
    url: item.metadataSourceUrl,
    site: item.metadataSourceSite,
    canonicalId: item.metadataSourceCanonicalId,
  });
  const sourceLinks = getLibrarySourceLinks(item.sources, {
    url: item.metadataSourceUrl,
    site: item.metadataSourceSite,
  });
  const preferredMeta = parseSourceMeta(preferredSource);
  const progress =
    item.totalChapters > 0 ? Math.round((item.chaptersRead / item.totalChapters) * 100) : 0;
  const isEnriching = item.enrichmentStatus === "pending" || item.enrichmentStatus === "running";
  const contentTypeLabel =
    item.contentType === "MANHWA"
      ? "Manhwa"
      : item.contentType === "MANHUA"
        ? "Manhua"
        : item.contentType === "MANGA"
          ? "Manga"
          : null;

  function act(e: MouseEvent, fn: () => void) {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }

  return (
    <Link href={`/series/${item.id}`} className="group block">
      <div className="relative overflow-hidden rounded-lg bg-gray-900 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl">
        <div className="aspect-2/3 overflow-hidden" style={{ background: coverGradient(item.title) }}>
          {item.hasCoverImage ? (
            <Image
              src={`/api/series/${item.id}/cover?u=${encodeURIComponent(item.updatedAt)}`}
              alt={`${item.title} cover`}
              width={320}
              height={480}
              unoptimized
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl font-bold tracking-widest text-white/20 transition-transform duration-300 group-hover:scale-110 select-none">
              {item.title.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black to-transparent p-4 pointer-events-none">
          <div className="space-y-2">
            <h3 className="line-clamp-2 text-sm font-medium text-white leading-snug">{item.title}</h3>
            {preferredMeta.alternativeTitles.length > 0 && (
              <p className="line-clamp-1 text-[10px] text-gray-300">
                {preferredMeta.alternativeTitles[0]}
              </p>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-yellow-400">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="text-xs">{item.rating ?? "-"}</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${statusBg(item.status)}`}
              >
                {formatStatus(item.status)}
              </span>
            </div>
            {contentTypeLabel && (
              <span className="inline-flex rounded-full border border-blue-500/50 bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium text-blue-200">
                {contentTypeLabel}
              </span>
            )}
            {isEnriching && <p className="text-[10px] text-amber-300">Enriching metadata...</p>}
            {item.enrichmentStatus === "failed" && (
              <p className="text-[10px] text-red-300">Metadata failed. Use retry.</p>
            )}
            {item.enrichmentLastError === "ecchi_warning" && (
              <p className="text-[10px] text-amber-200">Adult warning: ecchi content detected.</p>
            )}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-white/70">
                <div className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  <span>
                    {item.chaptersRead} / {item.totalChapters}
                  </span>
                </div>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
            {item.totalRereads > 0 && (
              <p className="text-[10px] font-medium text-cyan-300">Re-reads: {item.totalRereads}</p>
            )}
            {collectionTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {collectionTags.slice(0, 3).map((tag) => (
                  <span
                    key={`${item.id}-tag-${tag}`}
                    className="rounded-full border border-emerald-500/60 bg-emerald-900/60 px-1.5 py-0.5 text-[10px] text-emerald-200"
                  >
                    #{tag}
                  </span>
                ))}
                {collectionTags.length > 3 && (
                  <span className="rounded-full border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300">
                    +{collectionTags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="absolute inset-0 z-10 bg-linear-to-t from-black/90 via-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2.5">
            <p className="line-clamp-3 text-xs leading-relaxed text-white/80">
              {item.personalNotes || "Click to view details and edit."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={(e) => act(e, () => onChapter(item.id, -1))}
                className="rounded bg-white/20 px-2 py-0.5 text-xs text-white backdrop-blur hover:bg-white/30 transition-colors"
              >
                -1
              </button>
              <button
                onClick={(e) => act(e, () => onChapter(item.id, 1))}
                className="rounded bg-blue-600/80 px-2 py-0.5 text-xs text-white backdrop-blur hover:bg-blue-500 transition-colors"
              >
                +1
              </button>
              {sourceLinks.map((sourceLink) => (
                <button
                  key={`${item.id}-${sourceLink.label}`}
                  onClick={(e) => act(e, () => window.open(sourceLink.url, "_blank", "noopener,noreferrer"))}
                  className="rounded bg-orange-600/80 px-2 py-0.5 text-xs text-white backdrop-blur hover:bg-orange-500 transition-colors"
                  title={sourceLink.title}
                >
                  {sourceLink.label}
                </button>
              ))}
              <button
                onClick={(e) => act(e, () => onDelete(item.id))}
                className="rounded bg-red-700/60 p-1 text-white backdrop-blur hover:bg-red-600 transition-colors"
                aria-label="Delete series"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
