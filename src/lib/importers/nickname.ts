export function normalizeNickname(raw: unknown): string {
  return String(raw || "").trim();
}

export function isValidPublicNickname(nickname: string): boolean {
  // Conservative allowlist: letters, numbers, underscore, dash.
  return /^[a-zA-Z0-9_-]{2,32}$/.test(nickname);
}
