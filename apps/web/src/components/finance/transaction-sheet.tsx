"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Pencil, Split, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { CategoryIcon } from "@/components/finance/category-icon"
import { TransactionForm } from "@/components/finance/transaction-form"
import { IosSheet } from "@/components/ios/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, toMinor, todayISO } from "@/lib/format"
import { PALETTE } from "@/lib/palette"
import { invalidateFinancialData, useDeleteTransaction, useSaveTransaction } from "@/lib/queries"
import { detailView } from "@/lib/query-view"
import type { Debt, Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

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

export function TransactionSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const { data: t, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["transactions", "detail", id],
    queryFn: () => api.get<Transaction>(`/transactions/${id}`),
    enabled: !!id,
  })
  const view = detailView({ isError, hasData: !!t })
  const save = useSaveTransaction()
  const remove = useDeleteTransaction()
  const close = () => { setEditing(false); setSplitting(false); onOpenChange(false) }
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
        ) : editing ? (
          <TransactionForm saved
            initial={{ ...t, items: t.items.map((i) => ({ name: i.name, amount_minor: i.amount_minor })) }}
            busy={save.isPending}
            onCancel={() => setEditing(false)}
            submitLabel="Save changes"
            onSubmit={(input) => save.mutate({ id: t.id, data: input }, {
              onSuccess: () => { toast.success("Changes saved"); setEditing(false) },
              onError: (e) => toast.error(e.message),
            })}
          />
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
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
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
