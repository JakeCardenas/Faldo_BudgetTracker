import assert from "node:assert/strict"
import { test } from "node:test"
import { SUPPORTED_CURRENCIES, currencySymbol, formatCurrency } from "../src/lib/currency.ts"

const EXPECTED = { PHP: "₱", USD: "$", SGD: "S$", EUR: "€" }

test("every currency onboarding offers has its own symbol", () => {
  assert.deepEqual([...SUPPORTED_CURRENCIES].sort(), Object.keys(EXPECTED).sort())
  for (const code of SUPPORTED_CURRENCIES) assert.equal(currencySymbol(code), EXPECTED[code])
})

test("amounts and signed changes use the chosen currency, not pesos", () => {
  for (const code of SUPPORTED_CURRENCIES) {
    const symbol = EXPECTED[code]
    assert.equal(formatCurrency(123_456, code), `${symbol}1,234.56`)
    assert.equal(formatCurrency(50_000, code, { signed: true }), `+${symbol}500`)
    assert.equal(formatCurrency(-50_000, code, { signed: true }), `−${symbol}500`)
    if (code !== "PHP") assert.ok(!formatCurrency(50_000, code, { signed: true }).includes("₱"))
  }
})

test("an unknown currency falls back to its code", () => {
  assert.equal(currencySymbol("CAD"), "CAD ")
  assert.equal(formatCurrency(1_000, "CAD"), "CAD 10")
})
