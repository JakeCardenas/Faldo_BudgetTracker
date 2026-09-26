"use client"

import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArchiveRestore, FileJson, HardDriveDownload, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { ListGroup, ListRow } from "@/components/ios/list"
import { IosSheet } from "@/components/ios/sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { api, ApiError } from "@/lib/api"
import { checkBackupFile, restoreAction, restoreRows, restoreWarnings, type RestoreSummary } from "@/lib/backup"
import { formatDate } from "@/lib/format"
import { invalidateFinancialData } from "@/lib/queries"

type Step = { kind: "pick" } | { kind: "checking" } | { kind: "review"; file: File; summary: RestoreSummary }
  | { kind: "restoring"; file: File; summary: RestoreSummary } | { kind: "done"; summary: RestoreSummary }

function form(file: File, confirm?: string) {
  const data = new FormData()
  data.append("file", file)
  if (confirm) data.append("confirm_sha256", confirm)
  return data
}

/** Download a versioned backup, or restore one: preview first, then an explicit confirmation. */
export function BackupRestore() {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>({ kind: "pick" })
  const [error, setError] = useState<string | null>(null)
  const [understood, setUnderstood] = useState(false)

  function reset(next = false) {
    setStep({ kind: "pick" })
    setError(null)
    setUnderstood(false)
    setOpen(next)
  }

  async function choose(file: File | undefined) {
    if (!file) return
    const problem = checkBackupFile(file)
    if (problem) return setError(problem)
    setError(null)
    setStep({ kind: "checking" })
    try {
      const summary = await api.upload<RestoreSummary>("/me/backup/preview", form(file))
      setStep({ kind: "review", file, summary })
    } catch (e) {
      setStep({ kind: "pick" })
      setError(e instanceof ApiError ? e.message : "Couldn't read that backup. Try again.")
    }
  }

  async function restore() {
    if (step.kind !== "review") return
    setStep({ kind: "restoring", file: step.file, summary: step.summary })
    try {
      const summary = await api.upload<RestoreSummary>("/me/backup/restore", form(step.file, step.summary.sha256))
      await invalidateFinancialData(qc)
      setStep({ kind: "done", summary })
      toast.success("Backup restored")
    } catch (e) {
      setStep({ kind: "review", file: step.file, summary: step.summary })
      setError(e instanceof ApiError ? e.message : "The restore didn't finish, so nothing was changed. Try again.")
    }
  }

  const summary = step.kind === "review" || step.kind === "restoring" || step.kind === "done" ? step.summary : null
  const action = summary && step.kind !== "done" ? restoreAction(summary) : null

  return (
    <>
      <ListGroup className="mt-3">
        <ListRow icon={HardDriveDownload} title="Download a backup" detail="Everything, with receipt images" href="/api/v1/me/backup" external />
        <ListRow icon={FileJson} title="Download without receipt images" detail="Smaller, for large histories" href="/api/v1/me/backup?receipts=false" external />
        <ListRow icon={ArchiveRestore} title="Restore from a backup" detail="Preview first; nothing changes until you confirm" onClick={() => reset(true)} />
      </ListGroup>

      <IosSheet open={open} onOpenChange={(next) => { if (step.kind !== "restoring") reset(next) }} title="Restore from a backup" size="sm"
        footer={step.kind === "done" ? <Button size="lg" className="w-full" onClick={() => reset(false)}>Done</Button>
          : summary ? (
            <div className="space-y-3">
              {action && (
                <label className="flex items-start gap-3 text-sm leading-snug">
                  <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} className="mt-0.5" disabled={step.kind === "restoring"} />
                  <span>I've checked this preview. Add these records to my Faldo.</span>
                </label>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="lg" className="flex-1" disabled={step.kind === "restoring"} onClick={() => reset(true)}>Choose another file</Button>
                {action && (
                  <Button size="lg" className="flex-1" disabled={!understood || step.kind === "restoring"} onClick={restore}>
                    {step.kind === "restoring" && <Loader2 className="animate-spin" />} {action}
                  </Button>
                )}
              </div>
            </div>
          ) : undefined}>
        <div className="space-y-4">
          {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">{error}</p>}

          {(step.kind === "pick" || step.kind === "checking") && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Choose a backup you downloaded from Faldo. You&apos;ll see exactly what it adds before anything changes. Restoring never deletes or changes what&apos;s already here.
              </p>
              <input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="Backup file"
                onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = "" }} />
              <Button size="lg" className="w-full" disabled={step.kind === "checking"} onClick={() => input.current?.click()}>
                {step.kind === "checking" ? <><Loader2 className="animate-spin" /> Checking the backup</> : "Choose backup file"}
              </Button>
            </div>
          )}

          {summary && (
            <div className="space-y-4">
              <div>
                <p className="text-[0.9375rem] font-semibold">
                  {step.kind === "done" ? (summary.added_total ? "Restored" : "Nothing new to restore") : action ? "Ready to restore" : "Everything in this backup is already in Faldo"}
                </p>
                <p className="text-[0.8125rem] text-muted-foreground">
                  Backup from {summary.exported_at ? formatDate(summary.exported_at) : "an unknown date"}, in {summary.currency}
                </p>
              </div>
              {step.kind !== "done" && (
                <ul className="space-y-1.5 rounded-2xl bg-muted/60 px-4 py-3 text-[0.8125rem] leading-snug text-muted-foreground">
                  {restoreWarnings(summary).map((w, i) => <li key={w} className={i === 0 ? "font-medium text-foreground" : undefined}>{w}</li>)}
                </ul>
              )}
              <ListGroup>
                {restoreRows(summary, step.kind === "done").map((row) => <ListRow key={row.label} title={row.label} detail={row.detail} />)}
              </ListGroup>
            </div>
          )}
        </div>
      </IosSheet>
    </>
  )
}
