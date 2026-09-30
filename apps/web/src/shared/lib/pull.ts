/** How pull-to-refresh feels: how far the page follows the finger, and how far is far enough. */

/** Letting go once the page has moved this far (px) refreshes; less springs back with nothing done. */
export const PULL_TRIGGER = 64
/** Where the page rests while the refresh runs, leaving room for the spinner. */
export const PULL_HOLD = 56
/** However far the finger goes, the page never moves more than this. */
const PULL_MAX = 140

/**
 * The page's travel for a finger's travel: one to one at first, like dragging anything, then heavier the further it
 * goes (the rubber band at the top of a native list), so a long pull never drags the page down the screen.
 */
export function pullOffset(finger: number) {
  if (finger <= 0) return 0
  return PULL_MAX * (1 - Math.exp(-finger / PULL_MAX))
}
