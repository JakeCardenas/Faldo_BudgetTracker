import type { QueryClient } from "@tanstack/react-query"

/**
 * What this tab knows about whoever is signed in, and forgetting it at every change of person: signing out, signing in
 * or up (which may be someone else on a shared phone), and a request that says the session is gone. Without this, the
 * next person to sign in on the same tab would see the last person's balances until each screen refetched.
 *
 * No runtime imports, so it runs under the web tests as it is.
 */

/** Browser storage that belongs to the signed-in person. Device choices (theme, sounds, hide amounts) stay. */
export const USER_STORAGE_KEYS = ["faldo:actions-done", "faldo:last-account"] as const

type Removable = Pick<Storage, "removeItem">

function localStore(): Removable | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

/** Drops every cached answer and pending write, stops requests in flight, and clears per-person storage. */
export function forgetUser(qc: QueryClient, storage: Removable | null = localStore()) {
  void qc.cancelQueries()
  qc.clear()
  for (const key of USER_STORAGE_KEYS) {
    try {
      storage?.removeItem(key)
    } catch {
      // Storage can be unavailable (private mode); there's nothing kept there then.
    }
  }
}

/** A person just signed in or up: start from nothing, then keep only who they are. */
export function signedIn<T>(qc: QueryClient, me: T, storage?: Removable | null) {
  forgetUser(qc, storage)
  qc.setQueryData(["me"], me)
}

function within<T>(work: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timed out")), ms) })
  return Promise.race([Promise.resolve().then(work), late]).finally(() => clearTimeout(timer))
}

export interface SignOutSteps {
  /** Stop this device's phone notifications. Runs first, while the session can still say whose they are. */
  unsubscribePush: () => Promise<unknown>
  /** Ask the server to end the session. */
  revokeSession: () => Promise<unknown>
  /** Remove the session cookie from this browser, which works even when the server couldn't be reached. */
  dropCookie?: () => Promise<unknown>
  /** Anything else held in memory to drop, like toasts. */
  afterward?: () => void
  /** Leave the app; a full page load, so nothing from this person survives in memory. */
  navigate: (path: string) => void
  storage?: Removable | null
  timeoutMs?: number
}

/**
 * Signs out reliably: a failed or slow step never keeps the person's data on screen. Returns whether the server
 * confirmed the session ended (the tab forgets everything either way).
 */
export async function signOut(qc: QueryClient, steps: SignOutSteps): Promise<boolean> {
  const limit = steps.timeoutMs ?? 5000
  try {
    await within(steps.unsubscribePush, limit)
  } catch {
    // Notifications stay on for a device we couldn't reach; the server drops them once the push service says gone.
  }
  let revoked = true
  try {
    await within(steps.revokeSession, limit)
  } catch {
    revoked = false
  }
  if (steps.dropCookie) {
    try {
      await within(steps.dropCookie, limit)
    } catch {
      // Nothing more this tab can do; its copy of the data is still forgotten below.
    }
  }
  forgetUser(qc, steps.storage)
  steps.afterward?.()
  steps.navigate("/login")
  return revoked
}
