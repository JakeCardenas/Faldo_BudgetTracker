export const MOTION_KEY = "faldo:motion"

/**
 * Faldo follows the device's own Reduce Motion setting unless the person chose otherwise in Settings > Appearance:
 * "reduced" stills Faldo even on a device that animates, "full" keeps Faldo's motion on a device set to reduce it.
 */
export function resolveMotionReduced(stored: string | null, deviceReduced = false) {
  if (stored === "reduced") return true
  if (stored === "full") return false
  return deviceReduced
}

/** The same rule, run in <head> before the first paint (see app/layout). */
export const MOTION_SCRIPT = `try{var s=null;try{s=localStorage.getItem("${MOTION_KEY}")}catch(e){}if(s==="reduced"||(s!=="full"&&matchMedia("(prefers-reduced-motion: reduce)").matches))document.documentElement.dataset.motion="reduced"}catch(e){}`
