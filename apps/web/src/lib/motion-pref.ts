export const MOTION_KEY = "faldo:motion"

/**
 * Faldo animates fully by default, whatever the device's own Reduce Motion says (the owner's choice).
 * Only "Reduce motion" in Settings > Appearance stills it.
 */
export function resolveMotionReduced(stored: string | null) {
  return stored === "reduced"
}

/** The same rule, run in <head> before the first paint (see app/layout). */
export const MOTION_SCRIPT = `try{if(localStorage.getItem("${MOTION_KEY}")==="reduced")document.documentElement.dataset.motion="reduced"}catch(e){}`
