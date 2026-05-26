import { FormEvent, useState } from "react";
import { X } from "lucide-react";

type Props = {
  mode: "dynamic" | "collection";
  defaultName: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (name: string) => Promise<void>;
};

export function SaveViewModal({ mode, defaultName, busy = false, onClose, onConfirm }: Props) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }

    setError(null);
    await onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            {mode === "dynamic" ? "Save Current Filter" : "Save Collection"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 transition-colors hover:text-white"
            aria-label="Close save view modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <label className="block text-xs text-gray-400">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
