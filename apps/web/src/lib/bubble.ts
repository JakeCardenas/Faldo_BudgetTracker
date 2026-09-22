"use client"

import { useSyncExternalStore } from "react"

/**
 * The Faldo bubble: a floating chat head, like Messenger's, that you can drag anywhere and tap to ask
 * Faldo. Whether it shows, where you left it and whether you have seen its hint are per-device
 * preferences, kept in this browser.
 */
const SHOWN_KEY = "faldo:bubble"
const SPOT_KEY = "faldo:bubble-spot"
const HINT_KEY = "faldo:bubble-hint"
const EVENT = "faldo:bubble"

function read() {
  try {
    return window.localStorage.getItem(SHOWN_KEY) !== "off"
  } catch {
    return true
  }
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === SHOWN_KEY) callback() }
  window.addEventListener("storage", onStorage)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(EVENT, callback)
  }
}

export function setBubbleShown(shown: boolean) {
  try {
    window.localStorage.setItem(SHOWN_KEY, shown ? "on" : "off")
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}

export function useBubbleShown() {
  return useSyncExternalStore(subscribe, read, () => false)
}

/** Where the bubble rests: which side, and how far down its free band (0 top, 1 bottom). */
export interface BubbleSpot { side: "left" | "right"; y: number }

export function readBubbleSpot(): BubbleSpot {
  try {
    const spot = JSON.parse(window.localStorage.getItem(SPOT_KEY) ?? "") as Partial<BubbleSpot>
    if ((spot.side === "left" || spot.side === "right") && typeof spot.y === "number") {
      return { side: spot.side, y: Math.min(1, Math.max(0, spot.y)) }
    }
  } catch {}
  return { side: "right", y: 0.62 }
}

export function saveBubbleSpot(spot: BubbleSpot) {
  try {
    window.localStorage.setItem(SPOT_KEY, JSON.stringify(spot))
  } catch {}
}

/** The one-time "tap me" hint. */
export function bubbleHintSeen() {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1"
  } catch {
    return true
  }
}

export function markBubbleHintSeen() {
  try {
    window.localStorage.setItem(HINT_KEY, "1")
  } catch {}
}
