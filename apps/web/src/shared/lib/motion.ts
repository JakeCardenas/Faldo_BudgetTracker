"use client"

import { useSyncExternalStore } from "react"
import { MOTION_KEY, resolveMotionReduced } from "@/shared/lib/motion-pref"

/**
 * Faldo's motion setting, per device. It follows the phone's own Reduce Motion setting unless "Reduce motion" in
 * Settings > Appearance says otherwise (see lib/motion-pref). The result lives on <html data-motion="reduced"> so CSS
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

const DEVICE_QUERY = "(prefers-reduced-motion: reduce)"

function deviceReduced() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DEVICE_QUERY).matches
}

function apply() {
  const reduced = resolveMotionReduced(stored(), deviceReduced())
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
  // Changing Reduce Motion on the device while Faldo is open takes effect at once (unless Faldo has its own choice).
  const media = typeof window.matchMedia === "function" ? window.matchMedia(DEVICE_QUERY) : null
  media?.addEventListener("change", apply)
  return () => {
    window.removeEventListener(EVENT, callback)
    media?.removeEventListener("change", apply)
  }
}

export function useMotionReduced() {
  return useSyncExternalStore(subscribe, motionReduced, () => false)
}
