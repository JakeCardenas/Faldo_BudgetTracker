import assert from "node:assert/strict"
import { test } from "node:test"
import { isPublicPath, signedOutDestination } from "../src/shared/config/routes.ts"

test("signed out, Home opens the start page and any other private page goes to Log in, then back", () => {
  assert.equal(signedOutDestination("/"), "/welcome")
  assert.equal(signedOutDestination("/", "?add=expense"), "/welcome")
  assert.equal(signedOutDestination("/transactions", "?q=food"), "/login?next=%2Ftransactions%3Fq%3Dfood")
  assert.equal(signedOutDestination("/settings/security"), "/login?next=%2Fsettings%2Fsecurity")
  assert.equal(signedOutDestination("/onboarding"), "/login?next=%2Fonboarding")
})

test("the start page, the sign-in screens and the legal pages open signed out", () => {
  for (const path of ["/welcome", "/login", "/register", "/forgot-password", "/reset-password/abc", "/logout", "/privacy", "/terms"]) {
    assert.equal(signedOutDestination(path), null, path)
  }
})

test("a public path matches whole segments only", () => {
  assert.equal(isPublicPath("/loginx"), false)
  assert.equal(isPublicPath("/welcome-back"), false)
  assert.equal(isPublicPath("/terms/2026"), true)
  assert.equal(isPublicPath("/"), false)
})
