// Run with `npm test` (Node strips the types from qrph.ts). The payloads are QR Ph codes in the EMVCo format; their
// checksums were computed separately, so these also check the checksum code.
import assert from "node:assert/strict"
import { test } from "node:test"
import { parseQrPh } from "../src/lib/qrph.ts"

const GCASH_STORE = "00020101021128400011ph.ppmi.p2m0111GXCHPHM2XXX03061234565204581253036085802PH5918JOLLIBEE KATIPUNAN6011QUEZON CITY630419F9"
const MAYA_WITH_AMOUNT = "00020101021228400011ph.ppmi.p2m0111PAPHPHM1XXX03069988775204541153036085406150.505802PH59087-ELEVEN6006MAKATI62120508REF123456304F827"
const US_DOLLARS = "0002010102115204581253038405802US5904SHOP6003NYC6304E98E"

test("reads a store's static QR Ph code", () => {
  assert.deepEqual(parseQrPh(GCASH_STORE), {
    merchant: "Jollibee Katipunan", city: "Quezon City", amountMinor: null, reference: null, network: "GCash", dynamic: false,
  })
})

test("reads the amount and reference on a dynamic code", () => {
  assert.deepEqual(parseQrPh(MAYA_WITH_AMOUNT), {
    merchant: "7-Eleven", city: "Makati", amountMinor: 15050, reference: "REF12345", network: "Maya", dynamic: true,
  })
})

test("refuses a code whose checksum doesn't match", () => {
  assert.equal(parseQrPh(GCASH_STORE.replace("JOLLIBEE", "JOLLIBEF")), null)
  assert.equal(parseQrPh(GCASH_STORE.slice(0, -1) + "0"), null)
})

test("only peso payment codes count", () => {
  assert.equal(parseQrPh(US_DOLLARS), null)
  assert.equal(parseQrPh("https://www.bir.gov.ph/receipt/123"), null)
  assert.equal(parseQrPh(""), null)
  assert.equal(parseQrPh("000201010211"), null)
})
