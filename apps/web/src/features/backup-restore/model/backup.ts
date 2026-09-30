/** What the server says a restore would do (a preview) or did (after restoring). */
export interface RestoreSummary {
  format: string
  version: number
  exported_at: string | null
  currency: string
  sha256: string
  excluded: string[]
  records: { key: string; label: string; in_backup: number; added: number; already_there: number; renamed: number }[]
  attachments: { in_backup: number; added: number; already_there: number; renamed: number; receipts_without_image: number }
  money_plan: "added" | "already_there" | null
  added_total: number
  already_there_total: number
  renamed_accounts: number
}

export const MAX_BACKUP_BYTES = 30 * 1024 * 1024

/** A quick check before uploading, so an obviously wrong file never leaves the device. */
export function checkBackupFile(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith(".json")) return "Choose the .json file you downloaded with Download a backup."
  if (file.size === 0) return "That file is empty."
  if (file.size > MAX_BACKUP_BYTES) return "That backup is larger than 30 MB. Download one without receipt images and try again."
  return null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`

/** One line per kind of record: how many are in the backup and what happens (or, once restored, happened) to them. */
export function restoreRows(summary: RestoreSummary, done = false): { label: string; detail: string }[] {
  const verb = done ? "added" : "to add"
  const rows = summary.records.map((r) => {
    const parts = [r.added ? `${r.added.toLocaleString("en-US")} ${verb}` : null,
      r.already_there ? `${r.already_there.toLocaleString("en-US")} already in Faldo` : null]
    return { label: r.label, detail: parts.filter(Boolean).join(", ") || "Nothing to add" }
  })
  const a = summary.attachments
  if (a.in_backup || a.receipts_without_image) {
    const parts = [a.added ? `${plural(a.added, "image")} ${verb}` : null, a.already_there ? `${a.already_there.toLocaleString("en-US")} already in Faldo` : null,
      a.receipts_without_image ? `${plural(a.receipts_without_image, "receipt")} without an image in this backup` : null]
    rows.push({ label: "Receipt images", detail: parts.filter(Boolean).join(", ") || "Nothing to add" })
  }
  if (summary.money_plan) rows.push({ label: "Money plan", detail: summary.money_plan === "added" ? (done ? "Added" : "To add") : "You already have one; yours stays" })
  return rows
}

/** Things worth reading before confirming. */
export function restoreWarnings(summary: RestoreSummary): string[] {
  const warnings = ["Restoring adds what's missing. It never deletes or changes anything already in Faldo."]
  if (summary.renamed_accounts) {
    warnings.push(`${plural(summary.renamed_accounts, "account")} ${summary.renamed_accounts === 1 ? "shares a name" : "share names"} with ${summary.renamed_accounts === 1 ? "one" : "ones"} you have, so ${summary.renamed_accounts === 1 ? "it comes" : "they come"} back as "(restored)". Nothing is merged.`)
  }
  if (summary.attachments.receipts_without_image) {
    warnings.push(`This backup doesn't include ${summary.attachments.receipts_without_image === 1 ? "the image for 1 receipt" : `images for ${summary.attachments.receipts_without_image} receipts`}; ${summary.attachments.receipts_without_image === 1 ? "it comes" : "they come"} back without ${summary.attachments.receipts_without_image === 1 ? "it" : "them"}.`)
  }
  if (summary.excluded.length) warnings.push(`Not in backups: ${summary.excluded.join(", ")}.`)
  return warnings
}

/** The confirm button's label, or null when there is nothing to restore. */
export function restoreAction(summary: RestoreSummary): string | null {
  const total = summary.added_total + (summary.money_plan === "added" ? 1 : 0)
  return total > 0 ? `Add ${plural(total, "record")}` : null
}
