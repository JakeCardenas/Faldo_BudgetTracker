import assert from "node:assert/strict"
import { test } from "node:test"

// The privacy module reads and writes the browser's storage; a tiny stand-in is enough for masking text.
globalThis.window = { localStorage: { setItem() {}, getItem() { return null } }, dispatchEvent() {} }
const { maskAmounts, setAmountsHidden } = await import("../src/lib/privacy.ts")

test("Hide amounts masks amounts in every currency Faldo shows, not only pesos", () => {
  setAmountsHidden(true)
  try {
    assert.equal(maskAmounts("Spent ₱1,200, $45.50, S$30, €9 and −£2.5k"), "Spent ₱••••, $••••, S$••••, €•••• and £••••")
    assert.equal(maskAmounts("3 bills due on Oct 5"), "3 bills due on Oct 5", "plain numbers aren't amounts")
  } finally {
    setAmountsHidden(false)
  }
  assert.equal(maskAmounts("$45"), "$45")
})
