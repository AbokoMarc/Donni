export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** 5 s, 10 s, 20 s... plafonné à 5 min. `attempt` commence à 1. */
export function backoffDelay(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
}
