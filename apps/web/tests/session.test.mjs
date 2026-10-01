import assert from "node:assert/strict"
import { test } from "node:test"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { createElement as h } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { request, whenSignedOut } from "../src/shared/api/client.ts"
import { forgetUser, signedIn, signOut, USER_STORAGE_KEYS } from "../src/entities/session/model/session.ts"

// Screens read what the cache holds; `enabled: false` shows exactly what a screen would paint before any refetch.
const useCached = (queryKey) => useQuery({ queryKey, queryFn: () => new Promise(() => {}), enabled: false }).data

function Screens() {
  const me = useCached(["me"])
  const dashboard = useCached(["dashboard", "month"])
  const transactions = useCached(["transactions", {}])
  const chat = useCached(["conversation", "c1"])
  return h("main", null,
    h("h1", null, me ? `Good morning, ${me.display_name}` : "…"),
    h("p", null, dashboard ? `Safe to spend ${dashboard.safe_to_spend}` : ""),
    h("ul", null, (transactions?.items ?? []).map((t) => h("li", { key: t.id }, `${t.merchant} ${t.amount}`))),
    h("ol", null, (chat?.messages ?? []).map((m, i) => h("li", { key: i }, m))))
}

const render = (qc) => renderToStaticMarkup(h(QueryClientProvider, { client: qc }, h(Screens)))

function memoryStorage() {
  const data = new Map([["faldo:actions-done", "[\"a1\"]"], ["faldo:last-account", "acct-of-ana"], ["faldo:sounds", "on"]])
  return { data, removeItem: (key) => data.delete(key) }
}

const ANA = ["Ana Alpha", "₱12,345", "Alpha Bakery", "₱880", "Remind Ana Alpha about rent"]

function asAna(qc) {
  qc.setQueryData(["me"], { id: "ana", display_name: "Ana Alpha", email: "ana@example.com" })
  qc.setQueryData(["dashboard", "month"], { safe_to_spend: "₱12,345" })
  qc.setQueryData(["transactions", {}], { items: [{ id: "t1", merchant: "Alpha Bakery", amount: "₱880" }] })
  qc.setQueryData(["conversation", "c1"], { messages: ["Remind Ana Alpha about rent"] })
}

test("after Ana signs out and Ben signs in on the same tab, nothing of Ana's renders", async () => {
  const qc = new QueryClient()
  const storage = memoryStorage()
  asAna(qc)
  const before = render(qc)
  for (const text of ANA) assert.ok(before.includes(text), `the test screen shows ${text} while Ana is signed in`)

  const calls = []
  const revoked = await signOut(qc, {
    unsubscribePush: async () => { calls.push("push"); throw new Error("offline") },
    revokeSession: async () => { calls.push("logout"); throw new Error("offline") },
    dropCookie: async () => { calls.push("cookie") },
    afterward: () => calls.push("toasts"),
    navigate: (path) => calls.push(`go ${path}`),
    storage,
  })
  assert.equal(revoked, false, "the server couldn't be reached")
  assert.deepEqual(calls, ["push", "logout", "cookie", "toasts", "go /login"], "push first while signed in, then the rest")
  assert.equal(qc.getQueryCache().getAll().length, 0, "every cached answer is gone even though sign-out failed")
  for (const key of USER_STORAGE_KEYS) assert.equal(storage.data.has(key), false, `${key} is forgotten`)
  assert.equal(storage.data.get("faldo:sounds"), "on", "device choices stay")

  signedIn(qc, { id: "ben", display_name: "Ben Beta", email: "ben@example.com" }, storage)
  const after = render(qc)
  assert.ok(after.includes("Good morning, Ben Beta"))
  for (const text of ANA) assert.ok(!after.includes(text), `${text} must not render for Ben`)
})

test("signing in replaces whatever an earlier person left in the cache", () => {
  const qc = new QueryClient()
  asAna(qc)
  signedIn(qc, { id: "ben", display_name: "Ben Beta" }, null)
  assert.deepEqual(qc.getQueryCache().getAll().map((q) => q.queryKey), [["me"]])
  assert.ok(!render(qc).includes("Alpha"))
})

test("a slow sign-out step can't keep the person's data on screen", async () => {
  const qc = new QueryClient()
  asAna(qc)
  const navigated = []
  await signOut(qc, {
    unsubscribePush: () => new Promise(() => {}),
    revokeSession: () => new Promise(() => {}),
    navigate: (path) => navigated.push(path),
    storage: null,
    timeoutMs: 20,
  })
  assert.deepEqual(navigated, ["/login"])
  assert.equal(qc.getQueryCache().getAll().length, 0)
})

test("a request that finds the session gone forgets the person before anything else", async () => {
  const qc = new QueryClient()
  asAna(qc)
  whenSignedOut(() => forgetUser(qc, null))
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ title: "Unauthorized", status: 401, detail: "Sign in to continue." }),
    { status: 401, headers: { "content-type": "application/problem+json" } })
  try {
    await assert.rejects(request("GET", "/dashboard"), (error) => error.status === 401)
  } finally {
    globalThis.fetch = realFetch
    whenSignedOut(null)
  }
  assert.equal(qc.getQueryCache().getAll().length, 0)
})

test("leaving a demo to sign up forgets it the same way, then goes to Create account", async () => {
  const qc = new QueryClient()
  asAna(qc)
  const navigated = []
  await signOut(qc, {
    unsubscribePush: async () => {},
    revokeSession: async () => {},
    navigate: (path) => navigated.push(path),
    destination: "/register",
    storage: null,
  })
  assert.deepEqual(navigated, ["/register"])
  assert.equal(qc.getQueryCache().getAll().length, 0)
})
