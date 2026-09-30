"use client"

import { useMemo, useRef } from "react"
import { keyFor, type KeyedSubmission } from "@/lib/idempotency"

/**
 * Keeps one Idempotency-Key for the submission in progress (see lib/idempotency.ts): `for(payload)` before sending,
 * `done()` once it saved.
 */
export function useSubmissionKey() {
  const current = useRef<KeyedSubmission | null>(null)
  return useMemo(() => ({
    for(payload: unknown): string {
      current.current = keyFor(current.current, payload)
      return current.current.key
    },
    done() {
      current.current = null
    },
  }), [])
}
