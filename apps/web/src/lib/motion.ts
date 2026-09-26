"use client"

import { useSyncExternalStore } from "react"
import { MOTION_KEY, REDUCE_QUERY, resolveMotionReduced } from "@/lib/motion-pref"

/**
 * Faldo's motion setting, per device. Faldo follows the device's Reduce Motion until the owner chooses in
 * Settings > Appearance; that choice then wins either way. It lives on <html data-motion="reduced"> so CSS
 * applies it before the first paint (see app/layout).
 */
const EVENT = "faldo:motion"

export function motionReduced() {
  return typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced"
}

function stored() {
  try {
    return window.localStorage.getItem(MOTION_KEY)
  } catch {
    return null
  }
}

function apply() {
  const reduced = resolveMotionReduced(stored(), window.matchMedia(REDUCE_QUERY).matches)
  if (reduced) document.documentElement.dataset.motion = "reduced"
  else delete document.documentElement.dataset.motion
  window.dispatchEvent(new Event(EVENT))
}

export function setMotionReduced(reduced: boolean) {
  try {
    window.localStorage.setItem(MOTION_KEY, reduced ? "reduced" : "full")
  } catch {}
  apply()
}

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window.matchMedia(REDUCE_QUERY).addEventListener("change", apply)
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

export function useMotionReduced() {
  return useSyncExternalStore(subscribe, motionReduced, () => false)
}
