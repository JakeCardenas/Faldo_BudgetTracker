import type { Transaction } from "./types"

/** The API's problem type for an edit made from an older copy; its body carries the latest copy as `current`. */
export const STALE_REVISION = "urn:faldo:problem:stale-revision"

export interface Change {
  label: string
  before: string
  after: string
}

export interface ChangeFormatters {
  money: (minor: number, currency?: string) => string
  date: (iso: string) => string
}

const TYPE_LABELS: Record<string, string> = {
  income: "Income", expense: "Expense", transfer: "Transfer", debt_in: "Money owed, received", debt_out: "Money owed, paid out",
}

/** The latest copy of the transaction when `error` is a refused stale edit; null for any other error. */
export function staleCurrent(error: unknown): Transaction | null {
  if (!error || typeof error !== "object") return null
  const e = error as { status?: unknown; type?: unknown; body?: { current?: unknown } }
  const current = e.body?.current
  return e.status === 409 && e.type === STALE_REVISION && current && typeof current === "object" ? current as Transaction : null
}

const none = (value: string | null | undefined) => value?.trim() || "None"

/**
 * What changed between the copy an edit started from and the one saved since, in words, field by field. Only fields a
 * person edits are compared, so bookkeeping (version, updated_at) never shows up as a change.
 */
export function describeChanges(before: Transaction, after: Transaction, f: ChangeFormatters): Change[] {
  // Decide what changed on the raw values, then show it through the app's formatters: with amounts hidden, a changed
  // amount still shows up as changed (masked both ways) instead of disappearing.
  const raw: ChangeFormatters = { money: (minor, currency) => `${currency ?? ""} ${minor}`, date: (iso) => iso }
  const compared = rows(before, after, raw)
  return rows(before, after, f)
    .filter((_, i) => compared[i][1] !== compared[i][2])
    .map(([label, a, b]) => ({ label, before: a, after: b }))
}

function rows(before: Transaction, after: Transaction, f: ChangeFormatters): [string, string, string][] {
  const category = (t: Transaction) => none([t.category_name, t.subcategory_name].filter(Boolean).join(" · "))
  const items = (t: Transaction) => t.items.length
    ? t.items.map((i) => `${i.name} ${f.money(i.amount_minor, t.currency)}`).join(", ")
    : "None"
  return [
    ["Type", TYPE_LABELS[before.type] ?? before.type, TYPE_LABELS[after.type] ?? after.type],
    ["Amount", f.money(before.amount_minor, before.currency), f.money(after.amount_minor, after.currency)],
    ["Date", f.date(before.occurred_on), f.date(after.occurred_on)],
    ["Account", before.account_name, after.account_name],
    ["To account", none(before.to_account_name), none(after.to_account_name)],
    ["Merchant", none(before.merchant), none(after.merchant)],
    ["Category", category(before), category(after)],
    ["Payment method", none(before.payment_method), none(after.payment_method)],
    ["Notes", none(before.notes), none(after.notes)],
    ["Tags", before.tags.length ? before.tags.join(", ") : "None", after.tags.length ? after.tags.join(", ") : "None"],
    ["Items", items(before), items(after)],
  ]
}
