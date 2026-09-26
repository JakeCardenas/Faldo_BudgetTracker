import assert from "node:assert/strict"
import { test } from "node:test"
import { MOTION_SCRIPT, resolveMotionReduced } from "../src/lib/motion-pref.ts"
import { Spring, aim } from "../src/lib/spring.ts"

/** Runs the pre-paint script against a fake page and returns what it set. */
function runScript({ stored = null, deviceReduced = false, storageThrows = false } = {}) {
  const documentElement = { dataset: {} }
  const localStorage = { getItem: () => { if (storageThrows) throw new Error("blocked"); return stored } }
  const matchMedia = () => ({ matches: deviceReduced })
  new Function("localStorage", "matchMedia", "document", MOTION_SCRIPT)(localStorage, matchMedia, { documentElement })
  return documentElement.dataset.motion === "reduced"
}

test("Faldo animates by default, even when the device asks for reduced motion", () => {
  assert.equal(resolveMotionReduced(null), false)
  assert.equal(runScript({ deviceReduced: true }), false)
  assert.equal(runScript({ deviceReduced: false }), false)
})

test("Faldo's own Reduce motion setting stills it, and turning it off brings motion back", () => {
  assert.equal(resolveMotionReduced("reduced"), true)
  assert.equal(resolveMotionReduced("full"), false)
  assert.equal(runScript({ stored: "reduced" }), true)
  assert.equal(runScript({ stored: "full", deviceReduced: true }), false)
})

test("the pre-paint script matches the rule for every case, and survives blocked storage", () => {
  for (const stored of [null, "reduced", "full"]) {
    for (const deviceReduced of [false, true]) {
      assert.equal(runScript({ stored, deviceReduced }), resolveMotionReduced(stored), `${stored}/${deviceReduced}`)
    }
  }
  assert.doesNotThrow(() => runScript({ storageThrows: true }))
})

test("with reduced motion the tab lens lands on its tab at once, with no frames to run", () => {
  const lens = new Spring(4, { stiffness: 300, damping: 28 })
  assert.equal(aim(lens, 140, { stiffness: 300, damping: 28 }, true), false)
  assert.equal(lens.value, 140)
  assert.equal(lens.velocity, 0)
  assert.ok(lens.resting(0.1))
})

test("with full motion the tab lens glides there on its spring", () => {
  const lens = new Spring(4, { stiffness: 300, damping: 28 })
  assert.equal(aim(lens, 140, { stiffness: 300, damping: 28 }, false), true)
  assert.equal(lens.value, 4)
  lens.step(1 / 60)
  assert.ok(lens.value > 4 && lens.value < 140)
  for (let i = 0; i < 600 && !lens.resting(0.1); i++) lens.step(1 / 60)
  assert.ok(Math.abs(lens.value - 140) < 0.1)
})
