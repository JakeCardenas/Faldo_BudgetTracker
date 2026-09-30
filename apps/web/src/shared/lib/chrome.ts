"use client"

import { useSyncExternalStore } from "react"

/**
 * Whether the phone chrome (the tab bar and the page header above) has stepped aside so you can read,
 * as in Threads: scrolling down sends it away and scrolling back up brings it back. The tab bar decides
 * it from the scroll (see MobileNav); the page header and History's filters follow it.
 */
let away = false
const listeners = new Set<() => void>()

export function setChromeAway(next: boolean) {
  if (away === next) return
  away = next
  listeners.forEach((listener) => listener())
}

export function isChromeAway() {
  return away
}

export function subscribeChrome(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useChromeAway() {
  return useSyncExternalStore(subscribeChrome, isChromeAway, () => false)
}
