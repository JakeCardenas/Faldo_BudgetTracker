import assert from "node:assert/strict"
import { test } from "node:test"
import { finishSetup } from "../src/app/onboarding/finish.ts"

function recorder(save) {
  const calls = []
  const steps = {
    save,
    saved: (me) => calls.push(`saved ${me.id}`),
    leave: () => calls.push("leave"),
    setBusy: (busy) => calls.push(busy ? "busy" : "idle"),
    setError: (message) => calls.push(message === null ? "clear" : `error ${message}`),
    explain: (error) => error.message,
  }
  return { calls, steps }
}

test("finishing setup leaves only after the server saved it", async () => {
  const { calls, steps } = recorder(async () => ({ id: "ana" }))
  assert.equal(await finishSetup(steps), true)
  assert.deepEqual(calls, ["busy", "clear", "saved ana", "leave", "idle"])
})

test("when saving fails the person stays put, sees why, and can try again", async () => {
  const { calls, steps } = recorder(async () => { throw new Error("The server is unavailable right now.") })
  assert.equal(await finishSetup(steps), false)
  assert.deepEqual(calls, ["busy", "clear", "error The server is unavailable right now.", "idle"])
  assert.ok(!calls.includes("leave"), "never navigates away after a failure")

  // A retry that works goes through as normal.
  steps.save = async () => ({ id: "ana" })
  calls.length = 0
  assert.equal(await finishSetup(steps), true)
  assert.deepEqual(calls, ["busy", "clear", "saved ana", "leave", "idle"])
})
