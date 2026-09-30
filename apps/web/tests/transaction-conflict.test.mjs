import assert from "node:assert/strict"
import { test } from "node:test"
import { describeChanges, STALE_REVISION, staleCurrent } from "../src/features/transaction-edit/model/conflict.ts"

const base = {
  id: "t1", type: "expense", amount_minor: 25_000, currency: "PHP", occurred_on: "2026-09-29", account_id: "a1",
  account_name: "GCash", to_account_id: null, to_account_name: null, merchant: "Jollibee", category_id: "c1",
  category_name: "Food", category_color: null, category_icon: null, subcategory_id: null, subcategory_name: null,
  payment_method: null, notes: null, tags: ["lunch"], items: [], source: "manual", recurring_payment_id: null, debt_id: null,
  version: 1, created_at: "2026-09-29T04:00:00Z", updated_at: "2026-09-29T04:00:00Z",
}
const f = { money: (minor) => `₱${minor / 100}`, date: (iso) => iso }

test("a refused stale edit hands back the latest copy; other errors don't", () => {
  const current = { ...base, version: 2, amount_minor: 31_000 }
  assert.deepEqual(staleCurrent({ status: 409, type: STALE_REVISION, body: { current } }), current)
  // A 409 of another kind (a reused key, a money owed record) isn't a stale edit.
  assert.equal(staleCurrent({ status: 409, type: "about:blank", body: { detail: "Money owed" } }), null)
  assert.equal(staleCurrent({ status: 409, type: STALE_REVISION, body: {} }), null)
  assert.equal(staleCurrent(new Error("offline")), null)
  assert.equal(staleCurrent(null), null)
})

test("the conflict names what the other edit changed, from what was opened to what is saved now", () => {
  const current = { ...base, version: 3, amount_minor: 31_000, category_name: "Transport", tags: ["lunch", "work"], notes: "Grab home",
    updated_at: "2026-09-30T02:00:00Z" }
  assert.deepEqual(describeChanges(base, current, f), [
    { label: "Amount", before: "₱250", after: "₱310" },
    { label: "Category", before: "Food", after: "Transport" },
    { label: "Notes", before: "None", after: "Grab home" },
    { label: "Tags", before: "lunch", after: "lunch, work" },
  ])
})

test("bookkeeping alone (version, updated_at) is not reported as a change", () => {
  assert.deepEqual(describeChanges(base, { ...base, version: 2, updated_at: "2026-09-30T00:00:00Z" }, f), [])
})

test("with amounts hidden, a changed amount still shows as changed, but masked (never the numbers)", () => {
  const hidden = { money: () => "₱••••", date: (iso) => iso }
  const current = { ...base, version: 2, amount_minor: 26_000, items: [{ id: "i1", name: "Chickenjoy", quantity: "1", unit_amount_minor: null, amount_minor: 20_000 }] }
  const changes = describeChanges(base, current, hidden)
  assert.deepEqual(changes, [
    { label: "Amount", before: "₱••••", after: "₱••••" },
    { label: "Items", before: "None", after: "Chickenjoy ₱••••" },
  ])
  assert.ok(!JSON.stringify(changes).match(/\d{3}/))
})
