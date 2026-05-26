export function parseSelectedIndices(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.filter(
    (entry): entry is number =>
      typeof entry === "number" && Number.isInteger(entry) && entry >= 0,
  );

  return parsed.length > 0 ? parsed : [];
}

export function mapImportError(error: unknown): { message: string; status: number } {
  const message = error instanceof Error ? error.message : "Import failed";
  const status = /invalid|not found|private|rate limited|required|format/i.test(message)
    ? 400
    : 500;
  return { message, status };
}