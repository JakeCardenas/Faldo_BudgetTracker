// Source checks: toggling "Hide amounts" re-renders pages in place instead of remounting them. The rendered behaviour
// (filters kept, no replayed entrance) needs a browser; these guard the wiring that makes it so.
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const APP = new URL("../src/app/(app)/", import.meta.url).pathname
const shell = readFileSync(new URL("../src/components/layout/app-shell.tsx", import.meta.url), "utf8")

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pages(join(dir, e.name)) : e.name === "page.tsx" ? [join(dir, e.name)] : [])
}

test("the page is keyed by its route only, so hiding amounts doesn't remount it", () => {
  const key = shell.match(/<PageMain key=\{([^}]+)\}/)?.[1]
  assert.equal(key, "pathname")
})

test("every app page re-renders its amounts when Hide amounts changes", () => {
  const found = pages(APP)
  assert.ok(found.length > 20)
  for (const file of found) {
    const source = readFileSync(file, "utf8")
    const body = source.slice(source.indexOf("export default function"))
    assert.match(body, /^export default function \w+\([^)]*\)[^{]*\{\n\s+useMaskedAmounts\(\)/, file)
  }
})

test("server-written insight and report text is masked when amounts are hidden", async () => {
  const store = new Map()
  globalThis.window = {
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    dispatchEvent: () => true,
  }
  const { maskAmounts, setAmountsHidden } = await import("../src/lib/privacy.ts")
  const texts = [
    "In September 2026 so far, you earned ₱24,000 and spent ₱47,430, leaving −₱23,430.",
    "You've spent ₱12,360 of your ₱4,000 Shopping budget, ₱8,360 over.",
    "₱12,360 so far this month, compared with a ₱3,543.33 average for the same days.",
  ]
  setAmountsHidden(false)
  assert.equal(maskAmounts(texts[0]), texts[0])
  setAmountsHidden(true)
  for (const text of texts) {
    const masked = maskAmounts(text)
    assert.doesNotMatch(masked, /₱\s?\d/, masked)
    assert.match(masked, /₱••••/)
  }
  setAmountsHidden(false)
  delete globalThis.window
})

test("insight cards, the Insights pulse and the Reports summary go through maskAmounts", () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8")
  assert.match(read("components/finance/insight-card.tsx"), /maskAmounts\(insight\.title\)[\s\S]*maskAmounts\(insight\.body\)/)
  assert.match(read("app/(app)/insights/page.tsx"), /maskAmounts\(pulse\.text\)/)
  assert.match(read("app/(app)/reports/page.tsx"), /maskAmounts\(summary\.data\.text\)/)
})
