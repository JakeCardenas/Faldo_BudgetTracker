"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, FileUp, Loader2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { LargeTitle } from "@/components/ios/nav-header"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useCategories } from "@/lib/queries"
import type { Category } from "@/lib/types"
import { cn } from "@/lib/utils"

interface PreviewRow {
  line: number
  external_ref: string
  occurred_on: string
  description: string
  amount_minor: number
  reference: string | null
  merchant: string | null
  category_id: string | null
  kind: "transaction" | "transfer"
  counter_account_id: string | null
  status: "already_imported" | "possible_duplicate" | null
  include: boolean
}

interface Preview {
  account: { id: string; name: string; currency: string }
  columns: Record<string, string>
  date_order: "mdy" | "dmy" | "ymd"
  date_order_assumed: boolean
  signs_guessed: boolean
  summary: { rows: number; new: number; money_in_minor: number; money_out_minor: number; date_from: string; date_to: string
    already_imported: number; possible_duplicates: number; transfers: number }
  rows: PreviewRow[]
  errors: { line: number; message: string }[]
  other_accounts: { id: string; name: string }[]
}

interface Batch { id: string; account_name: string; file_name: string | null; imported: number; skipped: number
  date_from: string | null; date_to: string | null; created_at: string }

type Options = { date_order?: "mdy" | "dmy"; invert?: boolean }

function CategoryOptions({ categories, kind }: { categories: Category[]; kind: "expense" | "income" }) {
  const parents = categories.filter((c) => c.kind === kind && !c.parent_id)
  return (
    <>
      {parents.map((p) => {
        const children = categories.filter((c) => c.parent_id === p.id)
        return children.length ? (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name}</option>
            {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ) : <option key={p.id} value={p.id}>{p.name}</option>
      })}
    </>
  )
}

const SELECT = "h-8 w-full min-w-0 rounded-md border border-input bg-card px-2 text-[0.8125rem] outline-none focus:ring-3 focus:ring-ring/25"

function ReviewRow({ row, categories, others, onChange }: {
  row: PreviewRow; categories: Category[]; others: Preview["other_accounts"]; onChange: (patch: Partial<PreviewRow>) => void
}) {
  const locked = row.status === "already_imported"
  const inflow = row.amount_minor > 0
  const treat = row.kind === "transfer" ? `transfer:${row.counter_account_id ?? ""}` : "tx"
  return (
    <li className={cn("grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_14rem_auto] sm:items-center",
      !row.include && "opacity-60")}>
      <Checkbox checked={row.include} disabled={locked} onCheckedChange={(v) => onChange({ include: v === true })}
        aria-label={`Import ${row.description}`} className="mt-0.5 sm:mt-0" />
      <div className="min-w-0">
        <p className="truncate text-sm">{row.description}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {formatDate(row.occurred_on, "MMM d, yyyy")}
          {row.status === "already_imported" && <span className="font-medium">Already imported</span>}
          {row.status === "possible_duplicate" && <span className="font-medium text-warning">Looks like one you already logged</span>}
          {row.kind === "transfer" && row.status !== "already_imported" && <span className="font-medium">Move between your accounts?</span>}
        </p>
      </div>
      <div className="col-span-3 col-start-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:col-start-auto sm:grid-cols-1">
        <select aria-label="Treat as" className={SELECT} value={treat} disabled={locked}
          onChange={(e) => {
            const v = e.target.value
            if (v === "tx") onChange({ kind: "transaction", counter_account_id: null })
            else onChange({ kind: "transfer", counter_account_id: v.slice(9) || null })
          }}>
          <option value="tx">{inflow ? "Income" : "Spending"}</option>
          {row.kind === "transfer" && !row.counter_account_id && <option value="transfer:">Transfer: choose account</option>}
          {others.map((a) => <option key={a.id} value={`transfer:${a.id}`}>{inflow ? `Transfer from ${a.name}` : `Transfer to ${a.name}`}</option>)}
        </select>
        {row.kind === "transaction" && (
          <select aria-label="Category" className={SELECT} value={row.category_id ?? ""} disabled={locked}
            onChange={(e) => onChange({ category_id: e.target.value || null })}>
            <option value="">No category</option>
            <CategoryOptions categories={categories} kind={inflow ? "income" : "expense"} />
          </select>
        )}
      </div>
      <Money minor={row.amount_minor} signed={inflow} className={cn("row-start-1 col-start-3 text-sm font-medium sm:row-start-auto sm:col-start-auto", inflow && "text-income")} />
    </li>
  )
}

function RecentImports() {
  const qc = useQueryClient()
  const { data: batches = [], isLoading } = useQuery({ queryKey: ["imports"], queryFn: () => api.get<Batch[]>("/imports") })
  const [busy, setBusy] = useState<string | null>(null)
  const [undoing, setUndoing] = useState<Batch | null>(null)
  if (isLoading) return <Skeleton className="h-24 rounded-xl" />
  if (batches.length === 0) return null
  async function undo(batch: Batch) {
    setBusy(batch.id)
    try {
      const r = await api.delete<{ removed: number }>(`/imports/${batch.id}`)
      await Promise.all([invalidateFinancialData(qc), qc.invalidateQueries({ queryKey: ["imports"] })])
      toast.success(`Removed ${r.removed} imported ${r.removed === 1 ? "transaction" : "transactions"}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't undo the import.")
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="card-surface p-4 sm:p-5">
      <h2 className="section-title">Recent imports</h2>
      <ul className="mt-2 divide-y divide-border/60">
        {batches.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{b.file_name || "Statement"} · {b.account_name}</p>
              <p className="text-xs text-muted-foreground">
                {b.imported} imported{b.skipped ? `, ${b.skipped} skipped` : ""}
                {b.date_from && b.date_to && ` · ${formatDate(b.date_from, "MMM d")} to ${formatDate(b.date_to, "MMM d")}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => setUndoing(b)}>
              {busy === b.id ? <Loader2 className="animate-spin" /> : <Undo2 />} Undo
            </Button>
          </li>
        ))}
      </ul>
      <AlertDialog open={!!undoing} onOpenChange={(open) => { if (!open) setUndoing(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {undoing?.imported === 1 ? "transaction" : `${undoing?.imported} transactions`} added from {undoing?.file_name || "this statement"}, including any edits you made to them. Account balances go back to how they were.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (undoing) void undo(undoing); setUndoing(null) }}>Undo import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function ImportFlow() {
  const qc = useQueryClient()
  const params = useSearchParams()
  const { data: accounts = [], isLoading } = useAccounts()
  const { data: categories = [] } = useCategories()
  const usable = accounts.filter((a) => !a.archived)
  const [accountId, setAccountId] = useState<string>(params.get("account") ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [options, setOptions] = useState<Options>({})
  const [busy, setBusy] = useState<"preview" | "import" | null>(null)
  const account = accountId || usable[0]?.id || ""
  const chosen = useMemo(() => rows.filter((r) => r.include && r.status !== "already_imported"), [rows])
  const missingTransfer = chosen.some((r) => r.kind === "transfer" && !r.counter_account_id)

  async function runPreview(next: Options = options) {
    if (!file || !account) return
    setBusy("preview")
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("account_id", account)
      if (next.date_order) form.append("date_order", next.date_order)
      if (next.invert !== undefined) form.append("invert", String(next.invert))
      const result = await api.upload<Preview>("/imports/preview", form)
      setOptions(next)
      setPreview(result)
      setRows(result.rows)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't read that file.")
    } finally {
      setBusy(null)
    }
  }

  async function runImport() {
    if (!preview) return
    setBusy("import")
    try {
      const result = await api.post<{ batch_id: string | null; imported: number; skipped: number }>("/imports", {
        account_id: preview.account.id, file_name: file?.name ?? null,
        rows: chosen.map((r) => ({ external_ref: r.external_ref, line: r.line, occurred_on: r.occurred_on, description: r.description,
          amount_minor: r.amount_minor, kind: r.kind, counter_account_id: r.kind === "transfer" ? r.counter_account_id : null,
          category_id: r.kind === "transaction" ? r.category_id : null, merchant: r.kind === "transaction" ? r.merchant : null })),
      })
      await Promise.all([invalidateFinancialData(qc), qc.invalidateQueries({ queryKey: ["imports"] })])
      toast.success(`Imported ${result.imported} transaction${result.imported === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} already in Faldo` : ""}`)
      setPreview(null)
      setRows([])
      setFile(null)
      setOptions({})
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't import.")
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />
  if (usable.length === 0) {
    return <div className="card-surface"><EmptyState icon={FileUp} title="Add an account first" description="Imports go into one of your accounts."
      action={<Button asChild><Link href="/accounts">Go to Wallet</Link></Button>} /></div>
  }

  if (!preview) {
    return (
      <section className="card-surface space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="section-title">Upload a statement</h2>
          <p className="text-[0.8125rem] text-muted-foreground">
            A CSV from your bank or e-wallet with a date column and an amount column (or debit and credit). If your statement
            is a PDF, open it in a spreadsheet app and save it as CSV first. Nothing is saved until you review it.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="imp-account">Account</Label>
            <Select value={account} onValueChange={setAccountId}>
              <SelectTrigger id="imp-account" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{usable.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp-file">CSV file</Label>
            <input id="imp-file" type="file" accept=".csv,.tsv,.txt,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block h-10 w-full cursor-pointer rounded-lg border border-input bg-card text-sm file:mr-3 file:h-full file:border-0 file:bg-muted file:px-3 file:text-sm file:font-medium" />
          </div>
        </div>
        <Button onClick={() => runPreview({})} disabled={!file || busy === "preview"}>
          {busy === "preview" && <Loader2 className="animate-spin" />} Review statement
        </Button>
      </section>
    )
  }

  const s = preview.summary
  return (
    <section className="card-surface overflow-hidden">
      <div className="space-y-3 border-b p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">{file?.name ?? "Statement"} → {preview.account.name}</h2>
            <p className="text-[0.8125rem] text-muted-foreground">
              {s.rows} rows · {formatDate(s.date_from, "MMM d")} to {formatDate(s.date_to, "MMM d, yyyy")} · in{" "}
              <Money minor={s.money_in_minor} className="text-income" /> · out <Money minor={s.money_out_minor} />
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setPreview(null); setRows([]) }}>Start over</Button>
        </div>
        <ul className="space-y-1.5 text-[0.8125rem] text-muted-foreground">
          {preview.date_order_assumed && (
            <li className="flex flex-wrap items-center gap-x-2">Dates were read as month/day.
              <button type="button" className="font-medium text-primary hover:opacity-80" onClick={() => runPreview({ ...options, date_order: "dmy" })}>Read as day/month</button></li>
          )}
          {options.date_order === "dmy" && (
            <li className="flex flex-wrap items-center gap-x-2">Dates are read as day/month.
              <button type="button" className="font-medium text-primary hover:opacity-80" onClick={() => runPreview({ ...options, date_order: "mdy" })}>Switch back</button></li>
          )}
          {preview.signs_guessed && (
            <li className="flex flex-wrap items-center gap-x-2">Every amount was positive, so Faldo read them as money out.
              <button type="button" className="font-medium text-primary hover:opacity-80" onClick={() => runPreview({ ...options, invert: false })}>They&apos;re money in</button></li>
          )}
          {s.already_imported > 0 && <li>{s.already_imported} already in Faldo from an earlier import, so {s.already_imported === 1 ? "it's" : "they're"} skipped.</li>}
          {s.possible_duplicates > 0 && <li>{s.possible_duplicates === 1 ? "1 looks like a transaction you already logged. It's" : `${s.possible_duplicates} look like transactions you already logged. They're`} unticked; tick any that are new.</li>}
          {s.transfers > 0 && <li>{s.transfers === 1 ? "1 looks like a move" : `${s.transfers} look like moves`} between your own accounts. Keep {s.transfers === 1 ? "it" : "them"} as transfers so {s.transfers === 1 ? "it doesn't" : "they don't"} count as income or spending.</li>}
          {preview.errors.length > 0 && (
            <li className="flex gap-2 text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {preview.errors.length} line{preview.errors.length === 1 ? "" : "s"} couldn&apos;t be read and will be skipped (line {preview.errors.slice(0, 5).map((e) => e.line).join(", ")}{preview.errors.length > 5 ? ", …" : ""}).</li>
          )}
        </ul>
      </div>
      <ul className="max-h-[60dvh] divide-y divide-border/60 overflow-y-auto">
        {rows.map((row, i) => (
          <ReviewRow key={row.external_ref} row={row} categories={categories} others={preview.other_accounts}
            onChange={(patch) => setRows((all) => all.map((r, j) => (j !== i ? r : {
              ...r, ...patch,
              // Picking the other account for a transfer means "yes, bring this in"; other edits keep the tick as it was.
              include: patch.include ?? (patch.kind === "transfer" && patch.counter_account_id ? true : r.include),
            })))} />
        ))}
      </ul>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3 sm:px-5">
        <p className="text-[0.8125rem] text-muted-foreground">
          {missingTransfer ? "Choose the other account for each transfer." : `${chosen.length} of ${rows.length} will be added.`}
        </p>
        <Button onClick={runImport} disabled={busy === "import" || chosen.length === 0 || missingTransfer}>
          {busy === "import" && <Loader2 className="animate-spin" />} Import {chosen.length}
        </Button>
      </div>
    </section>
  )
}

export default function ImportPage() {
  return (
    <div className="space-y-5">
      <LargeTitle title="Import statement" subtitle="Bring in transactions from a bank or e-wallet CSV" back={{ href: "/accounts", label: "Accounts" }} />
      <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
        <ImportFlow />
      </Suspense>
      <RecentImports />
    </div>
  )
}
