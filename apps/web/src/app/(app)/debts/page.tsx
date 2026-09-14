"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { HandCoins, MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, toMinor, todayISO } from "@/lib/format"
import { invalidateFinancialData, useDebts } from "@/lib/queries"
import type { Debt } from "@/lib/types"
import { cn } from "@/lib/utils"

function DebtDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [direction, setDirection] = useState<"i_owe" | "owed_to_me">("i_owe")
  const [person, setPerson] = useState("")
  const [amount, setAmount] = useState("")
  const [due, setDue] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post("/debts", { direction, counterparty: person, amount_minor: toMinor(amount), due_on: due || null, notes: notes || null })
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
          <div className="space-y-1.5"><Label htmlFor="d-notes">Notes</Label><Textarea id="d-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PaymentDialog({ debt, onOpenChange }: { debt: Debt; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState(String(debt.outstanding_minor / 100))
  const [date, setDate] = useState(todayISO())
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post(`/debts/${debt.id}/payments`, { amount_minor: toMinor(amount), paid_on: date })
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
  const [tab, setTab] = useState("open")
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
    <div className="space-y-5 pt-2">
      <PageHeader title="Money owed" description="What you owe and what others owe you." actions={<Button onClick={() => setCreating(true)}><Plus /> Add record</Button>} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card-surface p-5"><p className="text-sm text-muted-foreground">You owe</p><Money minor={iOwe} className="text-2xl font-semibold tracking-tight" /></div>
        <div className="card-surface p-5"><p className="text-sm text-muted-foreground">Owed to you</p><Money minor={owedToMe} className="text-2xl font-semibold tracking-tight text-emerald" /></div>
      </div>
      <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="closed">Settled</TabsTrigger></TabsList></Tabs>
      {isLoading ? <Skeleton className="h-64 rounded-2xl" /> : list.length === 0 ? (
        <div className="card-surface"><EmptyState icon={HandCoins} title={tab === "open" ? "Nothing owed right now" : "No settled records"} description="Track loans, bill splits and IOUs so nothing slips through." action={tab === "open" ? <Button variant="outline" onClick={() => setCreating(true)}><Plus /> Add record</Button> : undefined} /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((debt) => (
            <div key={debt.id} className="card-surface space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={cn("text-xs font-medium", debt.direction === "i_owe" ? "text-warning" : "text-emerald")}>{debt.direction === "i_owe" ? "You owe" : "Owes you"}</p>
                  <p className="font-semibold">{debt.counterparty}</p>
                  <p className={cn("text-xs text-muted-foreground", debt.is_overdue && "text-destructive")}>
                    {debt.status !== "open" ? `${debt.status[0].toUpperCase()}${debt.status.slice(1)}` : debt.due_on ? `${debt.is_overdue ? "Overdue since" : "Due"} ${formatDate(debt.due_on)}` : "No due date"}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Options"><MoreHorizontal /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {debt.status === "open" && <DropdownMenuItem onSelect={() => update(debt, { status: "settled" })}>Mark settled</DropdownMenuItem>}
                    {debt.status === "open" && <DropdownMenuItem onSelect={() => update(debt, { status: "cancelled" })}>Cancel</DropdownMenuItem>}
                    <DropdownMenuItem variant="destructive" onSelect={() => update(debt, null)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p><Money minor={debt.outstanding_minor} className="text-2xl font-semibold tracking-tight" /> <span className="text-sm text-muted-foreground">of {formatMoney(debt.amount_minor)}</span></p>
              <ProgressBar value={(debt.paid_minor / debt.amount_minor) * 100} label={`${debt.counterparty} repaid`} />
              {debt.notes && <p className="text-sm text-muted-foreground">{debt.notes}</p>}
              {debt.payments.length > 0 && <p className="text-xs text-muted-foreground">{debt.payments.length} payment{debt.payments.length > 1 && "s"} · last {formatDate(debt.payments[debt.payments.length - 1].paid_on)}</p>}
              {debt.status === "open" && <Button variant="outline" size="sm" onClick={() => setPaying(debt)}>Record payment</Button>}
            </div>
          ))}
        </div>
      )}
      {creating && <DebtDialog onOpenChange={() => setCreating(false)} />}
      {paying && <PaymentDialog debt={paying} onOpenChange={() => setPaying(null)} />}
    </div>
  )
}
