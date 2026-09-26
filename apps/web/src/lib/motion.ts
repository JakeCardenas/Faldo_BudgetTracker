"use client"

import { useSyncExternalStore } from "react"
import { MOTION_KEY, resolveMotionReduced } from "@/lib/motion-pref"

/**
 * Faldo's motion setting, per device. Faldo animates fully by default, whatever the phone's own Reduce
 * Motion says (the owner's choice); "Reduce motion" in Settings > Appearance stills it. The choice
 * lives on <html data-motion="reduced"> so CSS applies it before the first paint (see app/layout).
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
  const reduced = resolveMotionReduced(stored())
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

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

export function useMotionReduced() {
  return useSyncExternalStore(subscribe, motionReduced, () => false)
}
