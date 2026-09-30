/**
 * One Idempotency-Key per logical submission. Saving the same thing again (a retry after a timeout, a second tap) reuses
 * the key, so the server records it once. Changing what's being saved gets a new key: the server refuses an old key sent
 * with a different request. After a successful save the key is dropped, so logging the same coffee twice on purpose is
 * two transactions.
 */

export interface KeyedSubmission {
  key: string
  fingerprint: string
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/** JSON with object keys sorted, so the same payload built in a different order has the same fingerprint. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
}

/** The submission to send `payload` under: the previous one if it was for the same payload, otherwise a new key. */
export function keyFor(previous: KeyedSubmission | null, payload: unknown, makeKey: () => string = newIdempotencyKey): KeyedSubmission {
  const fingerprint = stableStringify(payload)
  return previous && previous.fingerprint === fingerprint ? previous : { key: makeKey(), fingerprint }
}

/** What identifies a picked file for a retry: the same file picked or sent again is the same upload. */
export function fileFingerprint(file: { name: string; size: number; lastModified: number; type: string }) {
  return { name: file.name, size: file.size, lastModified: file.lastModified, type: file.type }
}
