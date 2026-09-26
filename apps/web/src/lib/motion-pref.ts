export const MOTION_KEY = "faldo:motion"
export const REDUCE_QUERY = "(prefers-reduced-motion: reduce)"

/** Faldo's own "Reduce motion" choice wins; until one is made, the device's Reduce Motion decides. */
export function resolveMotionReduced(stored: string | null, deviceReduced: boolean) {
  if (stored === "reduced") return true
  if (stored === "full") return false
  return deviceReduced
}

/** The same rule, run in <head> before the first paint (see app/layout). */
export const MOTION_SCRIPT = `try{var s=localStorage.getItem("${MOTION_KEY}");if(s==="reduced"||(s!=="full"&&matchMedia("${REDUCE_QUERY}").matches))document.documentElement.dataset.motion="reduced"}catch(e){}`
