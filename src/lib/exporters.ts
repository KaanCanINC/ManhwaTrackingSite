import { listSeries } from "@/lib/series-repository";

export function exportFullDatabase() {
  return {
    exportedAt: new Date().toISOString(),
    series: listSeries({}),
  };
}

export function exportMalCompatibleXml(): string {
  const series = listSeries({});

  const items = series
    .map((entry) => {
      const status =
        entry.status === "completed" ? "Completed" : entry.status === "reading" ? "Reading" : "Plan to Read";

      return `
      <manga>
        <series_title>${escapeXml(entry.title)}</series_title>
        <series_chapters>${entry.totalChapters}</series_chapters>
        <my_read_chapters>${entry.chaptersRead}</my_read_chapters>
        <my_start_date>${entry.startDate || "0000-00-00"}</my_start_date>
        <my_finish_date>${entry.finishDate || "0000-00-00"}</my_finish_date>
        <my_score>${entry.rating || 0}</my_score>
        <my_status>${status}</my_status>
        <my_comments>${escapeXml(entry.personalNotes)}</my_comments>
      </manga>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<myanimelist>\n${items}\n</myanimelist>`;
}

function escapeXml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
