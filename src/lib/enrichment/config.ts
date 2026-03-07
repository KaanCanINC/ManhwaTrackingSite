export const ENRICH_MIN_CONFIDENCE = Number(process.env.ENRICH_MIN_CONFIDENCE || 0.72);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
