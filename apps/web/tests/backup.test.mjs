import assert from "node:assert/strict"
import { test } from "node:test"
import { checkBackupFile, restoreAction, restoreRows, restoreWarnings } from "../src/lib/backup.ts"

const base = {
  format: "faldo-backup", version: 1, exported_at: "2026-09-25T10:00:00+00:00", currency: "PHP", sha256: "a".repeat(64),
  excluded: ["settings and preferences", "Faldo's memory", "chats and insights"],
  records: [
    { key: "accounts", label: "Accounts", in_backup: 3, added: 3, already_there: 0, renamed: 1 },
    { key: "categories", label: "Categories", in_backup: 40, added: 0, already_there: 40, renamed: 0 },
    { key: "transactions", label: "Transactions", in_backup: 1200, added: 1150, already_there: 50, renamed: 0 },
  ],
  attachments: { in_backup: 2, added: 2, already_there: 0, renamed: 0, receipts_without_image: 1 },
  money_plan: "added", added_total: 1153, already_there_total: 90, renamed_accounts: 1,
}

test("only a non-empty .json file under 30 MB is sent for checking", () => {
  assert.equal(checkBackupFile({ name: "faldo-backup-2026-09-25.json", size: 1024 }), null)
  assert.match(checkBackupFile({ name: "statement.csv", size: 1024 }), /\.json file/)
  assert.match(checkBackupFile({ name: "backup.json", size: 0 }), /empty/)
  assert.match(checkBackupFile({ name: "backup.JSON", size: 31 * 1024 * 1024 }), /30 MB/)
})

test("the preview says what each kind of record does: added, or already in Faldo", () => {
  const rows = Object.fromEntries(restoreRows(base).map((r) => [r.label, r.detail]))
  assert.equal(rows.Accounts, "3 to add")
  assert.equal(rows.Categories, "40 already in Faldo")
  assert.equal(rows.Transactions, "1,150 to add, 50 already in Faldo")
  assert.equal(rows["Receipt images"], "2 images to add, 1 receipt without an image in this backup")
  assert.equal(rows["Money plan"], "To add")
})

test("warnings explain that nothing is deleted, renamed accounts, missing images and what isn't backed up", () => {
  const warnings = restoreWarnings(base).join("\n")
  assert.match(warnings, /never deletes or changes/)
  assert.match(warnings, /1 account shares a name/)
  assert.match(warnings, /image for 1 receipt/)
  assert.match(warnings, /Not in backups: settings and preferences, Faldo's memory, chats and insights/)
})

test("the confirm button counts what will be added, and disappears when there is nothing new", () => {
  assert.equal(restoreAction(base), "Add 1,154 records")
  const nothing = { ...base, added_total: 0, money_plan: "already_there" }
  assert.equal(restoreAction(nothing), null)
  assert.ok(restoreRows(nothing).some((r) => r.detail === "You already have one; yours stays"))
})

test("after restoring, the same rows say what was added", () => {
  const rows = Object.fromEntries(restoreRows(base, true).map((r) => [r.label, r.detail]))
  assert.equal(rows.Accounts, "3 added")
  assert.equal(rows.Transactions, "1,150 added, 50 already in Faldo")
  assert.equal(rows["Money plan"], "Added")
})
