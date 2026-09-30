"use client"

import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Pencil, Split, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/shared/ui/money/amount-input"
import { CategoryIcon } from "@/shared/ui/category-icon"
import { TransactionForm } from "./transaction-form"
import { IosSheet } from "@/shared/ui/ios/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/ui/alert-dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Skeleton } from "@/shared/ui/skeleton"
import { api, ApiError } from "@/shared/api/client"
import { formatDate, formatMoney, toMinor, todayISO } from "@/shared/lib/format"
import { PALETTE } from "@/shared/lib/palette"
import { useDeleteTransaction, useSaveTransaction } from "@/entities/transaction"
import { invalidateFinancialData } from "@/shared/api/query-keys"
import { detailView } from "@/shared/lib/query-view"
import { describeChanges, staleCurrent } from "../model/conflict"
import type { Debt, Transaction, TransactionInput } from "@/shared/api/types"
import { cn } from "@/shared/lib/utils"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

const TYPE_LABELS: Record<string, string> = {
  income: "Income", expense: "Expense", transfer: "Transfer", debt_in: "Money owed, received", debt_out: "Money owed, paid out",
}

function SplitForm({ t, onDone }: { t: Transaction; onDone: () => void }) {
  const qc = useQueryClient()
  const [person, setPerson] = useState("")
  const [share, setShare] = useState("")
  const [due, setDue] = useState("")
  const [busy, setBusy] = useState(false)
  const minor = toMinor(share)
  const mine = minor ? t.amount_minor - minor : null
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!minor) return
    setBusy(true)
    try {
      const debt = await api.post<Debt>(`/transactions/${t.id}/split`, { counterparty: person.trim(), amount_minor: minor, due_on: due || null })
      await invalidateFinancialData(qc)
      toast.success(`${debt.counterparty} owes you ${formatMoney(debt.amount_minor)}`)
      onDone()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't split this.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <p className="text-sm font-medium">Split with someone</p>
        <p className="text-[0.8125rem] text-muted-foreground">You paid {formatMoney(t.amount_minor)}. Only your share counts as spending; theirs goes to Money owed.</p>
      </div>
      <div className="space-y-1.5"><Label htmlFor="split-person">Who owes you?</Label>
        <Input id="split-person" required maxLength={80} value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Mark" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="split-share">Their share</Label>
          <AmountInput id="split-share" required value={share} onValueChange={setShare} placeholder="0" /></div>
        <div className="space-y-1.5"><Label htmlFor="split-due">Pay back by <span className="font-normal text-muted-foreground">Optional</span></Label>
          <Input id="split-due" type="date" min={todayISO()} value={due} onChange={(e) => setDue(e.target.value)} /></div>
      </div>
      {mine !== null && (
        <p className={`tabular text-[0.8125rem] ${mine <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
          {mine <= 0 ? "Their share must be less than the whole purchase." : `Your share: ${formatMoney(mine)}`}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy || !minor || !person.trim() || (mine ?? 0) <= 0}>{busy && <Loader2 className="animate-spin" />} Save split</Button>
      </div>
    </form>
  )
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Entered manually", natural_language: "Added by describing it", receipt: "Scanned from a receipt",
  recurring: "Recurring payment", seed: "Imported sample data", import: "Imported from a statement",
}

/**
 * Shown when saving an edit was refused because the transaction changed elsewhere after the edit began. Nothing is
 * thrown away until the person chooses: their edits stay in the form below, and this says what the other edit changed.
 */
function EditConflict({ base, current, busy, formId, onUseLatest }: {
  base: Transaction
  current: Transaction
  busy: boolean
  /** The edit form: Keep my changes submits it as it is now, including anything changed after this appeared. */
  formId: string
  onUseLatest: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // The Save button is at the bottom of a long sheet; bring the explanation into view and give it focus.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    ref.current?.focus({ preventScroll: true })
  }, [current.version])
  const changes = describeChanges(base, current, {
    money: (minor, currency) => formatMoney(minor, currency),
    date: (iso) => formatDate(iso, "MMM d, yyyy"),
  })
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="edit-conflict-title"
      className="space-y-3 rounded-2xl bg-warning-soft p-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
      <div className="flex gap-2.5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="space-y-1">
          <p id="edit-conflict-title" className="font-semibold">This transaction changed while you were editing</p>
          <p className="text-muted-foreground">
            It was saved somewhere else (another device or tab) after you opened it. Your changes are still in the form below
            and haven&apos;t been saved.
          </p>
        </div>
      </div>
      {changes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">What the other edit changed</p>
          <ul className="divide-y rounded-xl border bg-card px-3">
            {changes.map((c) => (
              <li key={c.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="tabular min-w-0 text-right break-words">
                  <span className="text-muted-foreground line-through decoration-muted-foreground/60">{c.before}</span>
                  <span aria-hidden> → </span><span className="sr-only"> is now </span>{c.after}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" form={formId} className="sm:flex-1" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Keep my changes
        </Button>
        <Button variant="outline" className="sm:flex-1" disabled={busy} onClick={onUseLatest}>Use the latest version</Button>
      </div>
      <p className="text-xs text-muted-foreground">Keep my changes saves yours over the other edit. Use the latest version discards yours.</p>
    </div>
  )
}

export function TransactionSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [splitting, setSplitting] = useState(false)
  // The copy an edit started from. Saves send its version, so a background refetch can't quietly move the edit onto
  // a newer copy and overwrite what changed there.
  const [base, setBase] = useState<Transaction | null>(null)
  // The newer copy a save was refused against. While it's shown, saving means "keep my changes over it", so the form
  // saves against its version: a choice the person makes knowingly, never a silent overwrite.
  const [conflict, setConflict] = useState<Transaction | null>(null)
  const [formKey, setFormKey] = useState(0)
  const formId = useId()
  const { data: t, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["transactions", "detail", id],
    queryFn: () => api.get<Transaction>(`/transactions/${id}`),
    enabled: !!id,
  })
  const view = detailView({ isError, hasData: !!t })
  const save = useSaveTransaction()
  const remove = useDeleteTransaction()
  const stopEditing = () => { setEditing(false); setBase(null); setConflict(null) }
  const close = () => { stopEditing(); setSplitting(false); onOpenChange(false) }
  const startEditing = (from: Transaction) => { setBase(from); setConflict(null); setFormKey((k) => k + 1); setEditing(true) }
  const submitEdit = (from: Transaction, input: TransactionInput, version: number) =>
    save.mutate({ id: from.id, data: input, version }, {
      onSuccess: () => { toast.success("Changes saved"); stopEditing() },
      onError: (e) => {
        const current = staleCurrent(e)
        if (!current) return void toast.error(e.message)
        // Show the newer copy everywhere else too, and keep this person's edit on screen until they choose.
        qc.setQueryData(["transactions", "detail", current.id], current)
        void invalidateFinancialData(qc)
        setConflict(current)
      },
    })
  const owed = !!t?.debt_id
  const inflow = t?.type === "income" || t?.type === "debt_in"

  return (
    <>
      <IosSheet open={!!id} onOpenChange={(open) => { if (!open) close() }} title={editing ? "Edit transaction" : "Transaction"} size="sm">
        {view === "error" ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">
            <span className="flex-1">Couldn&apos;t load this transaction. {error?.message}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching && <Loader2 className="animate-spin" />} Try again
            </Button>
          </div>
        ) : !t ? (
          <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : editing && base ? (
          <div className="space-y-4">
            {conflict && (
              <EditConflict base={base} current={conflict} busy={save.isPending} formId={formId}
                onUseLatest={() => startEditing(conflict)} />
            )}
            <TransactionForm key={formKey} saved formId={formId}
              initial={{ ...base, items: base.items.map((i) => ({ name: i.name, amount_minor: i.amount_minor })) }}
              busy={save.isPending}
              onCancel={stopEditing}
              submitLabel={conflict ? "Keep my changes" : "Save changes"}
              onSubmit={(input) => submitEdit(base, input, conflict ? conflict.version : base.version)}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <CategoryIcon icon={t.type === "transfer" ? "transfer" : t.type === "debt_in" || t.type === "debt_out" ? "owed" : t.category_icon}
                color={t.type === "transfer" || t.type === "debt_in" || t.type === "debt_out" ? PALETTE.slate : t.category_color} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-semibold">{t.type === "transfer" ? "Transfer" : t.merchant ?? t.notes ?? t.category_name ?? "Transaction"}</p>
                <p className="text-[0.8125rem] text-muted-foreground">{formatDate(t.occurred_on, "EEEE, MMMM d, yyyy")}</p>
              </div>
            </div>
            <p className={cn("display-number", inflow && "text-income")}>
              {formatMoney(t.type === "expense" || t.type === "debt_out" ? -t.amount_minor : t.amount_minor, t.currency, { signed: inflow })}
            </p>
            <div className="divide-y rounded-2xl border bg-card px-4">
              <Row label="Type">{TYPE_LABELS[t.type] ?? t.type}</Row>
              <Row label={t.type === "transfer" ? "From" : "Account"}>{t.account_name}</Row>
              {t.to_account_name && <Row label="To">{t.to_account_name}</Row>}
              {t.category_name && <Row label="Category">{t.category_name}{t.subcategory_name && `, ${t.subcategory_name}`}</Row>}
              {t.payment_method && <Row label="Payment method">{t.payment_method}</Row>}
              {t.tags.length > 0 && <Row label="Tags">{t.tags.join(", ")}</Row>}
              <Row label="Source">{SOURCE_LABELS[t.source] ?? t.source}</Row>
            </div>
            {t.items.length > 0 && (
              <div className="space-y-2">
                <p className="text-[0.8125rem] font-medium text-muted-foreground">Items</p>
                <ul className="divide-y rounded-2xl border bg-card px-4">
                  {t.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 py-2.5 text-sm">
                      <span>{item.name}{Number(item.quantity) !== 1 && <span className="text-muted-foreground"> × {Number(item.quantity)}</span>}</span>
                      <span className="tabular">{formatMoney(item.amount_minor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {t.notes && (
              <div className="space-y-1">
                <p className="text-[0.8125rem] font-medium text-muted-foreground">Notes</p>
                <p className="text-sm leading-relaxed">{t.notes}</p>
              </div>
            )}
            {owed ? (
              <div className="space-y-3 rounded-2xl bg-muted/60 p-4 text-[0.8125rem]">
                <p>This is part of a Money owed record, so it moves your balance without counting as {inflow ? "income" : "spending"}.
                  Change or remove it from Money owed.</p>
                <Button variant="outline" size="sm" asChild><Link href="/debts" onClick={close}>Open Money owed</Link></Button>
              </div>
            ) : splitting ? (
              <SplitForm t={t} onDone={() => setSplitting(false)} />
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => startEditing(t)}><Pencil /> Edit</Button>
                  {t.type === "expense" && <Button variant="outline" size="lg" className="flex-1" onClick={() => setSplitting(true)}><Split /> Split</Button>}
                </div>
                <Button variant="ghost" className="w-full text-destructive hover:bg-danger-soft hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete transaction
                </Button>
              </div>
            )}
          </div>
        )}
      </IosSheet>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>Balances, budgets and insights will be recalculated. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => t && remove.mutate(t.id, {
              onSuccess: () => { toast.success("Transaction deleted"); close() },
              onError: (e) => toast.error(e.message),
            })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
