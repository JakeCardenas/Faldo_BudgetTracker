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
