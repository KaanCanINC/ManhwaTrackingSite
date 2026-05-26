import { Bookmark, BookmarkPlus, FolderPlus, Trash2 } from "lucide-react";
import type { SavedView } from "@/lib/contracts";

type Props = {
  views: SavedView[];
  activeViewId: string | null;
  onApplyView: (view: SavedView) => void;
  onClearActive: () => void;
  onOpenSaveDynamic: () => void;
  onOpenSaveCollection: () => void;
  onDeleteView: (id: string) => void;
};

export function SavedViewsPanel({
  views,
  activeViewId,
  onApplyView,
  onClearActive,
  onOpenSaveDynamic,
  onOpenSaveCollection,
  onDeleteView,
}: Props) {
  return (
    <div className="mb-4 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-gray-100">
          <Bookmark className="h-4 w-4" />
          Saved Filters & Collections
        </h3>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onOpenSaveDynamic}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-blue-500 hover:text-white"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            Save Current Filter
          </button>
          <button
            onClick={onOpenSaveCollection}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-emerald-500 hover:text-white"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Save Current List as Collection
          </button>
          {activeViewId && (
            <button
              onClick={onClearActive}
              className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white"
            >
              Clear Active View
            </button>
          )}
        </div>
      </div>

      {views.length === 0 ? (
        <p className="text-xs text-gray-500">No saved views yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {views.map((view) => {
            const isActive = activeViewId === view.id;
            return (
              <div
                key={view.id}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs ${
                  isActive
                    ? "border-blue-600 bg-blue-950/40 text-blue-200"
                    : "border-gray-700 bg-gray-900 text-gray-300"
                }`}
              >
                <button onClick={() => onApplyView(view)} className="hover:text-white">
                  {view.name}
                  <span className="ml-1 text-[10px] text-gray-500">
                    {view.mode === "collection" ? `(${view.collectionSeriesIds.length})` : "(filter)"}
                  </span>
                </button>
                <button
                  onClick={() => onDeleteView(view.id)}
                  className="rounded p-0.5 text-gray-500 hover:text-red-300"
                  title="Delete saved view"
                  aria-label="Delete saved view"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
