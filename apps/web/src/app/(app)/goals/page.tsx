"use client"

import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CalendarCheck, MoreHorizontal, Plus, Sparkles, Target, TrendingUp } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, formatPct, minorToInput, toMinor, todayISO } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useGoals } from "@/lib/queries"
import type { Goal } from "@/lib/types"
import { cn } from "@/lib/utils"

const NONE = "__none__"
const EMOJIS = ["💻", "🛟", "✈️", "📱", "🎓", "🏠", "🚗", "💍", "🎯"]

function GoalDialog({ goal, open, onOpenChange }: { goal?: Goal; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const [name, setName] = useState(goal?.name ?? "")
  const [emoji, setEmoji] = useState(goal?.emoji ?? "🎯")
  const [target, setTarget] = useState(minorToInput(goal?.target_minor))
  const [date, setDate] = useState(goal?.target_date ?? "")
  const [monthly, setMonthly] = useState(minorToInput(goal?.monthly_contribution_minor))
  const [initial, setInitial] = useState("")
  const [linked, setLinked] = useState(goal?.linked_account_id ?? NONE)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      name, emoji, target_minor: toMinor(target), target_date: date || null, monthly_contribution_minor: monthly ? toMinor(monthly) : null,
      linked_account_id: linked === NONE ? null : linked,
    }
    setBusy(true)
    try {
      if (goal) await api.patch(`/goals/${goal.id}`, body)
      else await api.post("/goals", { ...body, initial_amount_minor: toMinor(initial || "0") ?? 0 })
      await invalidateFinancialData(qc)
      toast.success(goal ? "Goal updated" : "Goal created")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save the goal.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{goal ? "Edit goal" : "New savings goal"}</DialogTitle><DialogDescription>Faldo calculates the monthly amount and projected date for you.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-1.5">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} aria-label={`Icon ${e}`}
                className={cn("flex size-9 items-center justify-center rounded-lg border text-lg transition", emoji === e ? "border-primary bg-accent" : "hover:bg-muted")}>{e}</button>
            ))}
          </div>
          <div className="space-y-1.5"><Label htmlFor="goal-name">Name</Label><Input id="goal-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MacBook Air" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="goal-target">Target amount</Label><AmountInput id="goal-target" required value={target} onValueChange={setTarget} placeholder="0" /></div>
            <div className="space-y-1.5"><Label htmlFor="goal-date">Target date</Label><Input id="goal-date" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="goal-monthly">Monthly contribution</Label><AmountInput id="goal-monthly" value={monthly} onValueChange={setMonthly} placeholder="Optional" /></div>
            {!goal && linked === NONE && <div className="space-y-1.5"><Label htmlFor="goal-initial">Already saved</Label><AmountInput id="goal-initial" value={initial} onValueChange={setInitial} placeholder="0" /></div>}
          </div>
          <div className="space-y-1.5">
            <Label>Linked savings account</Label>
            <Select value={linked} onValueChange={setLinked}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not linked (track contributions)</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Linked goals use that account's real balance as progress.</p>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : goal ? "Save" : "Create goal"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ContributeDialog({ goal, onOpenChange }: { goal: Goal; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const [amount, setAmount] = useState(minorToInput(goal.monthly_contribution_minor))
  const [date, setDate] = useState(todayISO())
  const [from, setFrom] = useState<string>(accounts.find((a) => a.is_spendable)?.id ?? "")
  const [withdraw, setWithdraw] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const minor = toMinor(amount)
    if (!minor) return
    setBusy(true)
    try {
      await api.post(`/goals/${goal.id}/contributions`, { amount_minor: withdraw ? -minor : minor, occurred_on: date, from_account_id: goal.linked_account_id ? from : null })
      await invalidateFinancialData(qc)
      toast.success(withdraw ? "Withdrawal recorded" : `Added ${formatMoney(minor)} to ${goal.name}`)
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
        <DialogHeader><DialogTitle>{goal.emoji} {goal.name}</DialogTitle><DialogDescription>{goal.linked_account_id ? `This records a transfer into ${goal.linked_account_name}.` : "Record money you've set aside for this goal."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!goal.linked_account_id && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
              <button type="button" onClick={() => setWithdraw(false)} className={cn("rounded-md py-1.5", !withdraw && "bg-card shadow-sm")}>Add</button>
              <button type="button" onClick={() => setWithdraw(true)} className={cn("rounded-md py-1.5", withdraw && "bg-card shadow-sm")}>Withdraw</button>
            </div>
          )}
          <AmountInput size="lg" value={amount} onValueChange={setAmount} autoFocus aria-label="Amount" placeholder="0" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="c-date">Date</Label><Input id="c-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            {goal.linked_account_id && (
              <div className="space-y-1.5"><Label>From</Label>
                <Select value={from} onValueChange={setFrom}><SelectTrigger className="w-full"><SelectValue placeholder="Account" /></SelectTrigger>
                  <SelectContent>{accounts.filter((a) => a.id !== goal.linked_account_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GoalCard({ goal, onEdit, onContribute }: { goal: Goal; onEdit: () => void; onContribute: () => void }) {
  const qc = useQueryClient()
  const tone = goal.status === "completed" ? "Completed" : goal.on_track === true ? "On track" : goal.on_track === false ? "Behind schedule" : "No target date"
  async function remove() {
    await api.delete(`/goals/${goal.id}`)
    await invalidateFinancialData(qc)
    toast.success("Goal deleted")
  }
  return (
    <div className="card-surface flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-xl" aria-hidden>{goal.emoji ?? "🎯"}</span>
          <div>
            <p className="font-semibold">{goal.name}</p>
            <p className={cn("text-xs", goal.on_track === false ? "text-warning" : "text-muted-foreground")}>{tone}{goal.linked_account_name && ` · ${goal.linked_account_name}`}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Goal options"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>Edit goal</DropdownMenuItem>
            <DropdownMenuItem asChild><Link href={`/assistant?q=${encodeURIComponent(`When can I afford my ${goal.name}?`)}`}>Ask Faldo about this</Link></DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={remove}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p><Money minor={goal.saved_minor} className="text-2xl font-semibold tracking-tight" /> <span className="text-sm text-muted-foreground">of {formatMoney(goal.target_minor)}</span></p>
          <span className="tabular text-sm font-medium">{formatPct(goal.pct_complete)}</span>
        </div>
        <ProgressBar value={goal.pct_complete} status={goal.on_track === false ? "behind" : "on_track"} className="h-2.5" label={`${goal.name} ${goal.pct_complete}% complete`} />
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-xs">
        <div><dt className="text-muted-foreground">Target date</dt><dd className="font-medium">{goal.target_date ? formatDate(goal.target_date, "MMM d, yyyy") : "—"}</dd></div>
        <div><dt className="text-muted-foreground">Remaining</dt><dd className="tabular font-medium">{formatMoney(goal.remaining_minor)}</dd></div>
        <div><dt className="text-muted-foreground">Required monthly</dt><dd className="tabular font-medium">{goal.required_monthly_minor ? formatMoney(goal.required_monthly_minor) : "—"}</dd></div>
        <div><dt className="text-muted-foreground">{goal.monthly_contribution_minor ? "Planned monthly" : "Avg. monthly"}</dt><dd className="tabular font-medium">{formatMoney(goal.monthly_contribution_minor ?? goal.average_monthly_minor)}</dd></div>
      </dl>
      <div className="flex items-center gap-2 text-sm">
        {goal.projected_completion_on ? <CalendarCheck className="size-4 text-primary" /> : <TrendingUp className="size-4 text-muted-foreground" />}
        <span className="text-muted-foreground">
          {goal.status === "completed" ? "Goal reached 🎉" : goal.projected_completion_on ? <>Estimated completion <span className="font-medium text-foreground">{formatDate(goal.projected_completion_on, "MMMM yyyy")}</span></> : "Add a contribution to see a projection"}
        </span>
      </div>
      <Button variant="outline" onClick={onContribute} className="mt-auto" disabled={goal.status === "completed"}><Plus /> {goal.linked_account_id ? "Transfer to savings" : "Add contribution"}</Button>
    </div>
  )
}

export default function GoalsPage() {
  const { data: goals, isLoading } = useGoals()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [contributing, setContributing] = useState<Goal | null>(null)
  const totalSaved = goals?.reduce((s, g) => s + g.saved_minor, 0) ?? 0
  const totalTarget = goals?.reduce((s, g) => s + g.target_minor, 0) ?? 0
  const monthly = goals?.reduce((s, g) => s + (g.monthly_contribution_minor ?? 0), 0) ?? 0

  return (
    <div className="space-y-5 pt-2">
      <PageHeader title="Savings goals" description="Targets, required monthly savings and projected dates, calculated from your data."
        actions={<><Button variant="outline" asChild className="hidden sm:inline-flex"><Link href="/assistant?q=When%20can%20I%20afford%20my%20MacBook%3F"><Sparkles /> Ask about goals</Link></Button><Button onClick={() => setCreating(true)}><Plus /> New goal</Button></>} />
      {isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96 rounded-2xl" />)}</div> : !goals?.length ? (
        <div className="card-surface"><EmptyState icon={Target} title="What are you saving for?" description="A MacBook, an emergency fund, a trip to Japan. Faldo tells you how much to set aside and when you'll get there." action={<Button onClick={() => setCreating(true)}><Plus /> Create your first goal</Button>} /></div>
      ) : (
        <>
          <div className="card-surface grid gap-4 p-5 sm:grid-cols-3">
            <div><p className="text-sm text-muted-foreground">Total saved</p><Money minor={totalSaved} className="text-2xl font-semibold tracking-tight" /></div>
            <div><p className="text-sm text-muted-foreground">Across all targets</p><Money minor={totalTarget} className="text-2xl font-semibold tracking-tight" /></div>
            <div><p className="text-sm text-muted-foreground">Planned per month</p><Money minor={monthly} className="text-2xl font-semibold tracking-tight" /></div>
          </div>
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {goals.map((g) => <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} onContribute={() => setContributing(g)} />)}
          </div>
        </>
      )}
      {creating && <GoalDialog open={creating} onOpenChange={setCreating} />}
      {editing && <GoalDialog goal={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
      {contributing && <ContributeDialog goal={contributing} onOpenChange={(o) => !o && setContributing(null)} />}
    </div>
  )
}
