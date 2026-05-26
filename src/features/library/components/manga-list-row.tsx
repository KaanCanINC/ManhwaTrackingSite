import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { MouseEvent } from "react";
import type { Series } from "@/lib/types";
import { coverGradient, formatStatus, getLibrarySourceLinks, statusBg } from "@/utils/ui-utils";

type Props = {
  item: Series;
  collectionTags?: string[];
  onChapter: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
};

export function MangaListRow({ item, collectionTags = [], onChapter, onDelete }: Props) {
  const sourceLinks = getLibrarySourceLinks(item.sources, {
    url: item.metadataSourceUrl,
    site: item.metadataSourceSite,
  });
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
    <Link href={`/series/${item.id}`} className="block">
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 transition-colors hover:border-gray-700">
        <div className="flex gap-3">
          <div
            className="relative h-28 w-20 shrink-0 overflow-hidden rounded-md"
            style={{ background: coverGradient(item.title) }}
          >
            {item.hasCoverImage ? (
              <Image
                src={`/api/series/${item.id}/cover?u=${encodeURIComponent(item.updatedAt)}`}
                alt={`${item.title} cover`}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xl font-bold text-white/20 select-none">
                {item.title.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="truncate text-sm font-medium text-white">{item.title}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${statusBg(item.status)}`}
              >
                {formatStatus(item.status)}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-300">
              <span>
                {item.chaptersRead} / {item.totalChapters} ({progress}%)
              </span>
              <span className="inline-flex items-center gap-1 text-yellow-400">
                <Star className="h-3.5 w-3.5 fill-current" />
                {item.rating ?? "-"}
              </span>
              {contentTypeLabel && (
                <span className="rounded-full border border-blue-500/50 bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium text-blue-200">
                  {contentTypeLabel}
                </span>
              )}
            </div>

            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>

            {collectionTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {collectionTags.slice(0, 5).map((tag) => (
                  <span
                    key={`${item.id}-row-tag-${tag}`}
                    className="rounded-full border border-emerald-500/60 bg-emerald-900/60 px-1.5 py-0.5 text-[10px] text-emerald-200"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {(isEnriching || item.enrichmentStatus === "failed" || item.enrichmentLastError === "ecchi_warning") && (
              <div className="mt-2 space-y-0.5 text-[10px]">
                {isEnriching && <p className="text-amber-300">Enriching metadata...</p>}
                {item.enrichmentStatus === "failed" && (
                  <p className="text-red-300">Metadata failed. Use retry.</p>
                )}
                {item.enrichmentLastError === "ecchi_warning" && (
                  <p className="text-amber-200">Adult warning: ecchi content detected.</p>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={(e) => act(e, () => onChapter(item.id, -1))}
                className="rounded bg-white/15 px-2 py-0.5 text-xs text-white hover:bg-white/25"
              >
                -1
              </button>
              <button
                onClick={(e) => act(e, () => onChapter(item.id, 1))}
                className="rounded bg-blue-600/80 px-2 py-0.5 text-xs text-white hover:bg-blue-500"
              >
                +1
              </button>
              {sourceLinks.map((sourceLink) => (
                <button
                  key={`${item.id}-list-${sourceLink.label}`}
                  onClick={(e) => act(e, () => window.open(sourceLink.url, "_blank", "noopener,noreferrer"))}
                  className="rounded bg-orange-600/80 px-2 py-0.5 text-xs text-white hover:bg-orange-500"
                  title={sourceLink.title}
                >
                  {sourceLink.label}
                </button>
              ))}
              <button
                onClick={(e) => act(e, () => onDelete(item.id))}
                className="rounded bg-red-700/70 px-2 py-0.5 text-xs text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
