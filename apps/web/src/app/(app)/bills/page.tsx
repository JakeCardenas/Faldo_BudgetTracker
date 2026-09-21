"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CalendarClock, Check, MoreHorizontal, Plus, SkipForward } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { PageHeader, SectionCard } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { FREQUENCY_LABELS, formatDate, formatMoney, minorToInput, relativeDays, toMinor, todayISO } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useCategories, useRecurring } from "@/lib/queries"
import type { Frequency, Recurring, RecurringKind } from "@/lib/types"
import { cn } from "@/lib/utils"

const KINDS: Record<RecurringKind, string> = { bill: "Bill", subscription: "Subscription", rent: "Rent", loan: "Loan", insurance: "Insurance", income: "Income", other: "Other" }
const NONE = "__none__"

function RecurringDialog({ item, onOpenChange }: { item?: Recurring; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const [name, setName] = useState(item?.name ?? "")
  const [kind, setKind] = useState<RecurringKind>(item?.kind ?? "bill")
  const [amount, setAmount] = useState(minorToInput(item?.amount_minor))
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? "monthly")
  const [nextDue, setNextDue] = useState(item?.next_due_on ?? todayISO())
  const [accountId, setAccountId] = useState(item?.account_id ?? NONE)
  const [categoryId, setCategoryId] = useState(item?.category_id ?? NONE)
  const [variable, setVariable] = useState(item?.is_amount_variable ?? false)
  const [busy, setBusy] = useState(false)
  const catKind = kind === "income" ? "income" : "expense"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = { name, kind, amount_minor: toMinor(amount), frequency, next_due_on: nextDue, is_amount_variable: variable,
      account_id: accountId === NONE ? null : accountId, category_id: categoryId === NONE ? null : categoryId }
    setBusy(true)
    try {
      if (item) await api.patch(`/recurring/${item.id}`, body)
      else await api.post("/recurring", { ...body, merchant: name })
      await invalidateFinancialData(qc)
      toast.success(item ? "Updated" : "Recurring payment added")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{item ? "Edit recurring payment" : "Add recurring payment"}</DialogTitle><DialogDescription>Bills, subscriptions, loans and income feed your forecast. Expected income is never counted as spendable until you record it.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-[1fr_9rem] gap-3">
            <div className="space-y-1.5"><Label htmlFor="r-name">Name</Label><Input id="r-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meralco" /></div>
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={kind} onValueChange={(v) => { setKind(v as RecurringKind); setCategoryId(NONE) }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="r-amount">Amount</Label><AmountInput id="r-amount" required value={amount} onValueChange={setAmount} placeholder="0" /></div>
            <div className="space-y-1.5"><Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FREQUENCY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="r-due">{frequency === "once" ? (kind === "income" ? "Expected on" : "Due on") : "Next due"}</Label><Input id="r-due" type="date" required value={nextDue} onChange={(e) => setNextDue(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>Not set</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Not set</SelectItem>{categories.filter((c) => c.kind === catKind && !c.parent_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={variable} onChange={(e) => setVariable(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Amount varies each time (e.g. electricity)</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PayDialog({ item, onOpenChange }: { item: Recurring; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const [amount, setAmount] = useState(minorToInput(item.amount_minor))
  const [date, setDate] = useState(todayISO())
  const [accountId, setAccountId] = useState<string>(item.account_id ?? accounts[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post(`/recurring/${item.id}/pay`, { amount_minor: toMinor(amount), paid_on: date, account_id: accountId || null })
      await invalidateFinancialData(qc)
      toast.success(`${item.name} marked as ${item.kind === "income" ? "received" : "paid"}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{item.kind === "income" ? "Record" : "Pay"} {item.name}</DialogTitle><DialogDescription>{item.frequency === "once" ? "Creates a transaction. One-time items close after this." : "Creates a transaction and moves the next due date forward."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <AmountInput size="lg" value={amount} onValueChange={setAmount} aria-label="Amount" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="p-date">Date</Label><Input id="p-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Account</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger className="w-full"><SelectValue placeholder="Account" /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Confirm"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function BillsPage() {
  const qc = useQueryClient()
  const { data: items, isLoading } = useRecurring()
  const [dialog, setDialog] = useState<{ mode: "new" | "edit" | "pay"; item?: Recurring } | null>(null)
  const active = (items ?? []).filter((i) => i.is_active)
  const outflows = active.filter((i) => i.kind !== "income")
  const monthly = outflows.reduce((s, i) => s + i.monthly_equivalent_minor, 0)
  const subscriptions = outflows.filter((i) => i.kind === "subscription").reduce((s, i) => s + i.monthly_equivalent_minor, 0)
  const dueSoon = outflows.filter((i) => i.days_until_due <= 7).reduce((s, i) => s + i.amount_minor, 0)

  async function action(item: Recurring, kind: "skip" | "toggle" | "delete") {
    try {
      if (kind === "skip") await api.post(`/recurring/${item.id}/skip`)
      if (kind === "toggle") await api.patch(`/recurring/${item.id}`, { is_active: !item.is_active })
      if (kind === "delete") await api.delete(`/recurring/${item.id}`)
      await invalidateFinancialData(qc)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update.")
    }
  }

  const row = (item: Recurring) => (
    <li key={item.id} className={cn("flex items-center gap-3 py-3", !item.is_active && "opacity-60")}>
      <div className={cn("flex w-12 shrink-0 flex-col items-center rounded-xl border py-1.5", item.days_until_due < 0 && "border-destructive/30 bg-danger-soft")}>
        <span className="text-[0.6rem] font-medium text-muted-foreground uppercase">{formatDate(item.next_due_on, "MMM")}</span>
        <span className="text-base leading-none font-semibold">{formatDate(item.next_due_on, "d")}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className={cn("truncate text-xs text-muted-foreground", item.days_until_due < 0 && "text-destructive")}>
          {KINDS[item.kind]} · {FREQUENCY_LABELS[item.frequency]}{item.account_name && ` · ${item.account_name}`} · {item.is_active ? relativeDays(item.days_until_due) : item.frequency === "once" ? "Done" : "Paused"}
        </p>
      </div>
      <div className="text-right">
        <Money minor={item.kind === "income" ? item.amount_minor : -item.amount_minor} signed={item.kind === "income"} className={cn("text-sm font-medium", item.kind === "income" && "text-income")} />
        {item.is_amount_variable && <p className="text-[0.7rem] text-muted-foreground">varies</p>}
      </div>
      <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => setDialog({ mode: "pay", item })} disabled={!item.is_active}><Check /> {item.kind === "income" ? "Received" : "Paid"}</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${item.name} options`}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="sm:hidden" onSelect={() => setDialog({ mode: "pay", item })}><Check /> Mark {item.kind === "income" ? "received" : "paid"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => action(item, "skip")}><SkipForward /> Skip this one</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog({ mode: "edit", item })}>Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => action(item, "toggle")}>{item.is_active ? "Pause" : "Resume"}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => action(item, "delete")}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Bills & recurring" description="Rent, utilities, subscriptions, loans and expected income." actions={<Button onClick={() => setDialog({ mode: "new" })}><Plus /> Add recurring</Button>} />
      {isLoading ? <Skeleton className="h-96 rounded-xl" /> : !items?.length ? (
        <div className="card-surface"><EmptyState icon={CalendarClock} title="No recurring payments yet" description="Add rent, Meralco, internet or Netflix so Faldo can forecast your month accurately." action={<Button onClick={() => setDialog({ mode: "new" })}><Plus /> Add your first bill</Button>} /></div>
      ) : (
        <>
          <div className="card-surface grid grid-cols-3 divide-x divide-border/60 py-4 [&>div]:min-w-0 [&>div]:px-3 sm:[&>div]:px-5">
            <div><p className="truncate text-xs text-muted-foreground sm:text-sm">A month</p><Money minor={monthly} className="block text-[1.0625rem] font-semibold tracking-[-0.02em] sm:text-2xl" /><p className="truncate text-xs text-muted-foreground">{formatMoney(monthly * 12, "PHP", { compact: true })} a year</p></div>
            <div><p className="truncate text-xs text-muted-foreground sm:text-sm">Subscriptions</p><Money minor={subscriptions} className="block text-[1.0625rem] font-semibold tracking-[-0.02em] sm:text-2xl" /><p className="truncate text-xs text-muted-foreground">per month</p></div>
            <div><p className="truncate text-xs text-muted-foreground sm:text-sm">Next 7 days</p><Money minor={dueSoon} className="block text-[1.0625rem] font-semibold tracking-[-0.02em] sm:text-2xl" /><p className="truncate text-xs text-muted-foreground">{outflows.filter((i) => i.days_until_due <= 7).length} due</p></div>
          </div>
          <SectionCard title="Payments" bodyClassName="pt-1"><ul className="divide-y">{outflows.map(row)}</ul></SectionCard>
          {active.some((i) => i.kind === "income") && <SectionCard title="Expected income" description="Not spendable until it arrives and you record it" bodyClassName="pt-1"><ul className="divide-y">{(items ?? []).filter((i) => i.kind === "income" && (i.is_active || i.frequency !== "once")).map(row)}</ul></SectionCard>}
          {(items ?? []).some((i) => !i.is_active) && <SectionCard title="Paused" bodyClassName="pt-1"><ul className="divide-y">{(items ?? []).filter((i) => !i.is_active && i.kind !== "income").map(row)}</ul></SectionCard>}
        </>
      )}
      {dialog?.mode === "new" && <RecurringDialog onOpenChange={() => setDialog(null)} />}
      {dialog?.mode === "edit" && dialog.item && <RecurringDialog item={dialog.item} onOpenChange={() => setDialog(null)} />}
      {dialog?.mode === "pay" && dialog.item && <PayDialog item={dialog.item} onOpenChange={() => setDialog(null)} />}
    </div>
  )
}
