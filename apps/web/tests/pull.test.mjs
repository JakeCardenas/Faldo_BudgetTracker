// Run with `npm test` (Node strips the types from pull.ts). How far the page follows a pull-to-refresh drag.
import assert from "node:assert/strict"
import { test } from "node:test"
import { PULL_HOLD, PULL_TRIGGER, pullOffset } from "../src/shared/lib/pull.ts"

test("a pull starts one to one with the finger", () => {
  assert.equal(pullOffset(0), 0)
  assert.equal(pullOffset(-30), 0)
  assert.ok(Math.abs(pullOffset(4) - 4) < 0.1)
})

test("it gets heavier the further it goes and never runs away", () => {
  const finger = [20, 60, 120, 240, 480, 2000]
  const page = finger.map(pullOffset)
  for (let i = 1; i < finger.length; i++) {
    assert.ok(page[i] > page[i - 1], "keeps following the finger")
    assert.ok(page[i] - page[i - 1] < finger[i] - finger[i - 1], "with resistance")
  }
  assert.ok(pullOffset(10_000) <= 140)
})

test("refreshing takes a deliberate pull, not a nudge", () => {
  assert.ok(pullOffset(60) < PULL_TRIGGER, "60px of finger is not enough")
  assert.ok(pullOffset(110) >= PULL_TRIGGER, "110px is")
  assert.ok(PULL_HOLD <= PULL_TRIGGER, "the page rests no lower than where the refresh began")
})
