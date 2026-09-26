import assert from "node:assert/strict"
import { test } from "node:test"
import { detailView, listView } from "../src/lib/query-view.ts"

test("a failed first load of transactions shows an error, not an empty ledger", () => {
  assert.equal(listView({ isLoading: false, isError: true, hasData: false, count: 0 }), "error")
})

test("the transaction list still shows loading, empty and loaded states", () => {
  assert.equal(listView({ isLoading: true, isError: false, hasData: false, count: 0 }), "loading")
  assert.equal(listView({ isLoading: false, isError: false, hasData: true, count: 0 }), "empty")
  assert.equal(listView({ isLoading: false, isError: false, hasData: true, count: 3 }), "items")
})

test("a failed refresh keeps the transactions already on screen", () => {
  assert.equal(listView({ isLoading: false, isError: true, hasData: true, count: 3 }), "items")
})

test("a failed transaction detail request shows an error, not an endless skeleton", () => {
  assert.equal(detailView({ isError: true, hasData: false }), "error")
  assert.equal(detailView({ isError: false, hasData: false }), "loading")
  assert.equal(detailView({ isError: false, hasData: true }), "ready")
})

test("retrying a failed load shows loading, then the transactions once it succeeds", () => {
  const steps = [
    { isLoading: false, isError: true, hasData: false, count: 0 },
    { isLoading: false, isError: true, hasData: false, count: 0 },
    { isLoading: false, isError: false, hasData: true, count: 5 },
  ]
  assert.deepEqual(steps.map(listView), ["error", "error", "items"])
  assert.deepEqual([
    { isError: true, hasData: false },
    { isError: false, hasData: false },
    { isError: false, hasData: true },
  ].map(detailView), ["error", "loading", "ready"])
})
