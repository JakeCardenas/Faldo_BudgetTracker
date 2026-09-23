"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Plus } from "lucide-react"
import { MoneyOwedIcon, TINTED } from "@/components/finance/category-icon"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { HeaderButton } from "@/components/ios/nav-header"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, toMinor, todayISO } from "@/lib/format"
import { PALETTE } from "@/lib/palette"
import { invalidateFinancialData, useAccounts, useCategories, useDebts } from "@/lib/queries"
import { useUrlIntent } from "@/lib/use-url-intent"
import type { Debt } from "@/lib/types"
import { cn } from "@/lib/utils"

function AccountPicker({ value, onChange, label, id }: { value: string; onChange: (v: string) => void; label: string; id: string }) {
  const { data: accounts = [] } = useAccounts()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Just keep a record</SelectItem>
          {accounts.filter((a) => !a.archived).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function DebtDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [direction, setDirection] = useState<"i_owe" | "owed_to_me">("i_owe")
  const [person, setPerson] = useState("")
  const [amount, setAmount] = useState("")
  const [due, setDue] = useState("")
  const [notes, setNotes] = useState("")
  const [accountId, setAccountId] = useState("none")
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post("/debts", { direction, counterparty: person, amount_minor: toMinor(amount), due_on: due || null, notes: notes || null,
        account_id: accountId === "none" ? null : accountId })
      await invalidateFinancialData(qc)
      toast.success("Saved")
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
        <DialogHeader><DialogTitle>Record money owed</DialogTitle><DialogDescription>Keep track of utang, splits and loans between friends and family.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Tabs value={direction} onValueChange={(v) => setDirection(v as typeof direction)}>
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="i_owe">I owe</TabsTrigger><TabsTrigger value="owed_to_me">Owed to me</TabsTrigger></TabsList>
          </Tabs>
          <div className="space-y-1.5"><Label htmlFor="d-person">{direction === "i_owe" ? "Who you owe" : "Who owes you"}</Label><Input id="d-person" required maxLength={80} value={person} onChange={(e) => setPerson(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="d-amount">Amount</Label><AmountInput id="d-amount" required value={amount} onValueChange={setAmount} /></div>
            <div className="space-y-1.5"><Label htmlFor="d-due">Due date</Label><Input id="d-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          <AccountPicker id="d-account" value={accountId} onChange={setAccountId}
            label={direction === "i_owe" ? "Did the money go into an account?" : "Did the money leave an account?"} />
          <p className="-mt-2 text-xs text-muted-foreground">
            {accountId === "none" ? "Balances stay as they are." : direction === "i_owe"
              ? "Your balance goes up, but it isn't counted as income." : "Your balance goes down, but it isn't counted as spending."}
          </p>
          <div className="space-y-1.5"><Label htmlFor="d-notes">Notes</Label><Textarea id="d-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PaymentDialog({ debt, onOpenChange }: { debt: Debt; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: categories = [] } = useCategories()
  const [amount, setAmount] = useState(String(debt.outstanding_minor / 100))
  const [date, setDate] = useState(todayISO())
  const [accountId, setAccountId] = useState("none")
  const [categoryId, setCategoryId] = useState("none")
  const iOwe = debt.direction === "i_owe"
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post(`/debts/${debt.id}/payments`, { amount_minor: toMinor(amount), paid_on: date,
        account_id: accountId === "none" ? null : accountId,
        category_id: iOwe && accountId !== "none" && categoryId !== "none" ? categoryId : null })
      await invalidateFinancialData(qc)
      toast.success("Payment recorded")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
    }
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Record a payment</DialogTitle><DialogDescription>{formatMoney(debt.outstanding_minor)} outstanding with {debt.counterparty}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <AmountInput size="lg" value={amount} onValueChange={setAmount} aria-label="Amount" />
          <div className="space-y-1.5"><Label htmlFor="pay-date">Date</Label><Input id="pay-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <AccountPicker id="pay-account" value={accountId} onChange={setAccountId} label={iOwe ? "Paid from" : "Received in"} />
          {iOwe && accountId !== "none" && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-category">Count it as spending? <span className="font-normal text-muted-foreground">Optional</span></Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="pay-category" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No, it just pays back a loan</SelectItem>
                  {categories.filter((c) => c.kind === "expense" && !c.parent_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Choose a category when you&apos;re paying back your share of something, like a meal someone covered.</p>
            </div>
          )}
          <Button type="submit" className="w-full">Save payment</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function DebtsPage() {
  const qc = useQueryClient()
  const { data: debts, isLoading } = useDebts()
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState<Debt | null>(null)
  const [deleting, setDeleting] = useState<Debt | null>(null)
  const [tab, setTab] = useState("open")
  const wantsNew = useUrlIntent("new")

  useEffect(() => {
    if (!wantsNew) return
    const timer = setTimeout(() => setCreating(true), 0)
    return () => clearTimeout(timer)
  }, [wantsNew])
  const list = (debts ?? []).filter((d) => (tab === "open" ? d.status === "open" : d.status !== "open"))
  const iOwe = (debts ?? []).filter((d) => d.direction === "i_owe" && d.status === "open").reduce((s, d) => s + d.outstanding_minor, 0)
  const owedToMe = (debts ?? []).filter((d) => d.direction === "owed_to_me" && d.status === "open").reduce((s, d) => s + d.outstanding_minor, 0)

  async function update(debt: Debt, body: object | null) {
    try {
      if (body) await api.patch(`/debts/${debt.id}`, body)
      else await api.delete(`/debts/${debt.id}`)
      await invalidateFinancialData(qc)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update.")
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Money owed" description="Utang, loans and split bills. Only real money movements change your balances." actions={<HeaderButton onClick={() => setCreating(true)} aria-label="Add record"><Plus /><span className="max-lg:sr-only">Add record</span></HeaderButton>} />
      <div className="card-surface grid grid-cols-2 divide-x divide-border/60 py-4 [&>div]:min-w-0 [&>div]:px-4 sm:[&>div]:px-5">
        <div><p className="text-xs text-muted-foreground sm:text-sm">You owe</p><Money minor={iOwe} className="block text-[1.375rem] font-semibold tracking-[-0.025em] sm:text-2xl" /></div>
        <div><p className="text-xs text-muted-foreground sm:text-sm">Owed to you</p><Money minor={owedToMe} className="block text-[1.375rem] font-semibold tracking-[-0.025em] text-income sm:text-2xl" /></div>
      </div>
      <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="closed">Settled</TabsTrigger></TabsList></Tabs>
      {isLoading ? <Skeleton className="h-64 rounded-xl" /> : list.length === 0 ? (
        <div className="card-surface"><EmptyState icon={MoneyOwedIcon} title={tab === "open" ? "Nothing owed right now" : "No settled records"} description={tab === "open" ? "Track loans, bill splits and IOUs so nothing slips through." : "Records you mark settled or cancel move here, with their payments."} action={tab === "open" ? <Button variant="outline" onClick={() => setCreating(true)}><Plus /> Add record</Button> : undefined} /></div>
      ) : (
        <ul className="ios-group divide-y divide-border/60">
          {list.map((debt) => {
            const owe = debt.direction === "i_owe"
            const partial = debt.paid_minor > 0 && debt.outstanding_minor > 0
            const when = debt.status !== "open" ? `${debt.status[0].toUpperCase()}${debt.status.slice(1)}`
              : debt.due_on ? `${debt.is_overdue ? "Overdue since" : "Due"} ${formatDate(debt.due_on, "MMM d")}` : "No due date"
            return (
              <li key={debt.id} className="flex items-start gap-3 px-4 py-3.5">
                <span aria-hidden style={{ "--cat": owe ? PALETTE.apricot : PALETTE.green } as React.CSSProperties}
                  className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-bold", TINTED)}>
                  {debt.counterparty.trim()[0]?.toUpperCase() ?? "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em]">{debt.counterparty}</p>
                  <p className="text-[0.8125rem] text-muted-foreground">
                    <span className={cn("font-medium", owe ? "text-warning" : "text-income")}>{owe ? "You owe" : "Owes you"}</span>
                    {" · "}<span className={cn(debt.is_overdue && debt.status === "open" && "font-medium text-expense")}>{when}</span>
                  </p>
                  {partial && (
                    <div className="mt-2 max-w-xs">
                      <ProgressBar value={(debt.paid_minor / debt.amount_minor) * 100} label={`${debt.counterparty} repaid`} />
                      <p className="tabular mt-1 text-xs text-muted-foreground">
                        {formatMoney(debt.paid_minor)} of {formatMoney(debt.amount_minor)} paid back
                        {debt.payments.length > 0 && `, last on ${formatDate(debt.payments[debt.payments.length - 1].paid_on, "MMM d")}`}
                      </p>
                    </div>
                  )}
                  {(debt.notes || debt.account_name || debt.source_transaction_id) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {debt.notes ?? (debt.source_transaction_id ? "Split from a purchase" : owe ? `Received in ${debt.account_name}` : `Paid from ${debt.account_name}`)}
                    </p>
                  )}
                  {debt.status === "open" && (
                    <button type="button" onClick={() => setPaying(debt)}
                      className="pressable hit mt-2.5 inline-flex h-8 items-center rounded-full bg-muted px-3.5 text-[0.8125rem] font-medium text-foreground hover:bg-accent">
                      Record payment
                    </button>
                  )}
                </div>
                <Money minor={debt.outstanding_minor} className={cn("shrink-0 pt-0.5 text-[0.9375rem] font-bold tracking-[-0.01em]", !owe && "text-income")} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mr-2 -mt-1 size-9" aria-label={`Options for ${debt.counterparty}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {debt.status === "open" && <DropdownMenuItem onSelect={() => update(debt, { status: "settled" })}>Mark settled</DropdownMenuItem>}
                    {debt.status === "open" && <DropdownMenuItem onSelect={() => update(debt, { status: "cancelled" })}>Cancel</DropdownMenuItem>}
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(debt)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      )}
      {creating && <DebtDialog onOpenChange={() => setCreating(false)} />}
      {paying && <PaymentDialog debt={paying} onOpenChange={() => setPaying(null)} />}
      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.source_transaction_id
                ? "The split is undone and the full amount goes back on the original purchase. Any repayments recorded here are removed too."
                : "Any money movements recorded with it are removed, so account balances will change. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (deleting) void update(deleting, null); setDeleting(null) }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
