import assert from "node:assert/strict"
import { test } from "node:test"
import { fileFingerprint, keyFor, stableStringify } from "../src/lib/idempotency.ts"

let n = 0
const makeKey = () => `key-${++n}`

test("retrying the same submission reuses its key", () => {
  const input = { type: "expense", amount_minor: 25_000, account_id: "a1", tags: ["lunch"] }
  const first = keyFor(null, input, makeKey)
  const retry = keyFor(first, { ...input }, makeKey)
  assert.equal(retry.key, first.key)
})

test("the same payload built in a different order is the same submission", () => {
  const first = keyFor(null, { amount_minor: 100, type: "expense", notes: undefined }, makeKey)
  const reordered = keyFor(first, { type: "expense", amount_minor: 100 }, makeKey)
  assert.equal(reordered.key, first.key)
  assert.equal(stableStringify({ b: [1, { d: 1, c: 2 }], a: null }), stableStringify({ a: null, b: [1, { c: 2, d: 1 }] }))
})

test("changing what is being saved gets a new key, so the server never sees an old key with a new request", () => {
  const first = keyFor(null, { amount_minor: 100 }, makeKey)
  const changed = keyFor(first, { amount_minor: 150 }, makeKey)
  assert.notEqual(changed.key, first.key)
  // Array order is meaningful (drafts, items), so a reordered list is a different request.
  const list = keyFor(null, { transactions: [{ id: 1 }, { id: 2 }] }, makeKey)
  assert.notEqual(keyFor(list, { transactions: [{ id: 2 }, { id: 1 }] }, makeKey).key, list.key)
})

test("after a save succeeds (the submission is cleared), the same entry again is a new transaction", () => {
  const input = { type: "expense", amount_minor: 15_000 }
  const first = keyFor(null, input, makeKey)
  assert.notEqual(keyFor(null, input, makeKey).key, first.key)
})

test("an uploaded file is identified by name, size, date and type, so a different photo gets its own key", () => {
  const photo = { name: "receipt.jpg", size: 2048, lastModified: 1, type: "image/jpeg" }
  const first = keyFor(null, fileFingerprint(photo), makeKey)
  assert.equal(keyFor(first, fileFingerprint({ ...photo }), makeKey).key, first.key)
  assert.notEqual(keyFor(first, fileFingerprint({ ...photo, name: "other.jpg" }), makeKey).key, first.key)
})
