import { useSyncExternalStore } from "react"

/**
 * "Hide amounts": a per-device privacy preference. While on, formatMoney masks every amount, so
 * balances, Safe to Spend and totals read as ₱•••• wherever they appear. Labels stay visible.
 */
const KEY = "faldo:hide-amounts"
const EVENT = "faldo:privacy"
let hidden = false

export function amountsHidden() {
  return hidden
}

/** Snapshot for the store; also keeps the formatter's flag current. */
function read() {
  try {
    hidden = window.localStorage.getItem(KEY) === "1"
  } catch {
    hidden = false
  }
  return hidden
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) callback() }
  window.addEventListener("storage", onStorage)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(EVENT, callback)
  }
}

export function setAmountsHidden(next: boolean) {
  hidden = next
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0")
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}

/** Subscribes to the preference. */
export function useAmountsHidden() {
  return useSyncExternalStore(subscribe, read, () => false)
}

/** Masks peso amounts inside text written elsewhere (for example Faldo's notes). */
export function maskAmounts(text: string) {
  return hidden ? text.replace(/[−-]?₱\s?[\d,]+(?:\.\d+)?[KkMm]?/g, "₱••••") : text
}
