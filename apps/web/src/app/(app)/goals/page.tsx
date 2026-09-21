"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MessageCircle, MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"
import { Panda } from "@/components/brand/panda"
import { AmountInput } from "@/components/finance/amount-input"
import { Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { Segmented } from "@/components/ios/segmented"
import { IosSheet } from "@/components/ios/sheet"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, minorToInput, toMinor, todayISO } from "@/lib/format"
import { GOAL_ICONS, GoalIcon, goalIconId } from "@/lib/goal-icons"
import { goalStatusLine } from "@/lib/goals"
import { invalidateFinancialData, useAccounts, useGoals } from "@/lib/queries"
import { useUrlIntent } from "@/lib/use-url-intent"
import type { Goal } from "@/lib/types"
import { cn } from "@/lib/utils"

const NONE = "__none__"

function GoalDialog({ goal, open, onOpenChange }: { goal?: Goal; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const [name, setName] = useState(goal?.name ?? "")
  const [emoji, setEmoji] = useState(goalIconId(goal?.emoji))
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
    <IosSheet open={open} onOpenChange={onOpenChange} title={goal ? "Edit goal" : "New savings goal"} size="sm"
      description="Faldo works out the monthly amount and when you'll get there."
      footer={<Button type="submit" form="goal-form" size="lg" className="w-full" disabled={busy || !name.trim() || !toMinor(target)}>{busy ? "Saving…" : goal ? "Save changes" : "Create goal"}</Button>}>
        <form id="goal-form" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Goal icon">
              {GOAL_ICONS.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" role="radio" aria-checked={emoji === id} onClick={() => setEmoji(id)} aria-label={label} title={label}
                  className={cn("pressable flex size-10 items-center justify-center rounded-full transition-colors", emoji === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")}>
                  <Icon className="size-4" strokeWidth={1.85} />
                </button>
              ))}
            </div>
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
        </form>
    </IosSheet>
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
    <IosSheet open onOpenChange={onOpenChange} title={`Add to ${goal.name}`} size="sm"
      description={goal.linked_account_id ? `This records a transfer into ${goal.linked_account_name}.` : "Record money you've set aside for this goal."}
      footer={<Button type="submit" form="contribute-form" size="lg" className="w-full" disabled={busy || !toMinor(amount)}>{busy ? "Saving…" : withdraw ? "Record withdrawal" : "Add money"}</Button>}>
        <form id="contribute-form" onSubmit={submit} className="space-y-4">
          {!goal.linked_account_id && (
            <Segmented label="Add or withdraw" className="w-full" value={withdraw ? "withdraw" : "add"} onChange={(v) => setWithdraw(v === "withdraw")}
              options={[{ value: "add", label: "Add money" }, { value: "withdraw", label: "Withdraw" }]} />
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
        </form>
    </IosSheet>
  )
}

function GoalCard({ goal, onEdit, onContribute }: { goal: Goal; onEdit: () => void; onContribute: () => void }) {
  const qc = useQueryClient()
  const done = goal.status === "completed" || goal.pct_complete >= 100
  async function remove() {
    await api.delete(`/goals/${goal.id}`)
    await invalidateFinancialData(qc)
    toast.success("Goal deleted")
  }
  return (
    <article className="card-surface flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground" aria-hidden><GoalIcon value={goal.emoji} className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[1.0625rem] font-semibold tracking-[-0.015em]">{goal.name}</h2>
          <p className={cn("text-[0.8125rem]", goal.on_track === false && !done ? "text-warning" : "text-muted-foreground")}>
            {done ? "Goal reached" : goalStatusLine(goal)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="-mt-1 -mr-2" aria-label={`${goal.name} options`}><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>Edit goal</DropdownMenuItem>
            <DropdownMenuItem asChild><Link href={`/assistant?q=${encodeURIComponent(`When can I afford my ${goal.name}?`)}`}>Ask Faldo about it</Link></DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={remove}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <p className="min-w-0">
          <Money minor={goal.saved_minor} className="text-[1.75rem] leading-none font-semibold tracking-[-0.035em]" />
          <span className="tabular ml-1.5 text-sm text-muted-foreground">of {formatMoney(goal.target_minor)}</span>
        </p>
        <span className="tabular text-[0.9375rem] font-semibold">{Math.round(goal.pct_complete)}%</span>
      </div>
      <ProgressBar value={goal.pct_complete} status={goal.on_track === false && !done ? "behind" : "on_track"} className="mt-3 h-2.5" label={`${goal.name} ${Math.round(goal.pct_complete)}% saved`} />

      {done ? (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-secondary/70 p-3">
          <Panda pose="happy" sizes="72px" className="w-16 shrink-0" />
          <p className="text-sm font-medium">You did it. {formatMoney(goal.target_minor)} saved for {goal.name}.</p>
        </div>
      ) : (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Target</dt><dd className="font-medium">{goal.target_date ? formatDate(goal.target_date, "MMMM yyyy") : "No date"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Still needed</dt><dd className="tabular font-medium">{formatMoney(goal.remaining_minor)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{goal.monthly_contribution_minor ? "You plan each month" : "Average a month"}</dt><dd className="tabular font-medium">{formatMoney(goal.monthly_contribution_minor ?? goal.average_monthly_minor)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Needed each month</dt><dd className="tabular font-medium">{goal.required_monthly_minor ? formatMoney(goal.required_monthly_minor) : "No date set"}</dd></div>
        </dl>
      )}

      {!done && (
        <Button variant="secondary" onClick={onContribute} className="mt-5 self-start"><Plus /> {goal.linked_account_id ? "Transfer to savings" : "Add money"}</Button>
      )}
    </article>
  )
}

export default function GoalsPage() {
  const { data: goals, isLoading } = useGoals()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [contributing, setContributing] = useState<Goal | null>(null)
  const wantsNew = useUrlIntent("new")
  const contributeTo = useUrlIntent("contribute")

  useEffect(() => {
    if (!wantsNew) return
    const timer = setTimeout(() => setCreating(true), 0)
    return () => clearTimeout(timer)
  }, [wantsNew])

  useEffect(() => {
    const goal = contributeTo ? goals?.find((g) => g.id === contributeTo) : undefined
    if (!goal) return
    const timer = setTimeout(() => setContributing(goal), 0)
    return () => clearTimeout(timer)
  }, [contributeTo, goals])

  const active = goals?.filter((g) => g.status === "active") ?? []
  const totalSaved = active.reduce((s, g) => s + g.saved_minor, 0)
  const totalTarget = active.reduce((s, g) => s + g.target_minor, 0)
  const monthly = active.reduce((s, g) => s + (g.monthly_contribution_minor ?? 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Goals" description="What you're saving toward."
        actions={<>
          <Button variant="secondary" asChild className="hidden sm:inline-flex"><Link href="/assistant?q=When%20can%20I%20reach%20my%20goals%3F"><MessageCircle /> Ask Faldo</Link></Button>
          <Button onClick={() => setCreating(true)}><Plus /> New goal</Button>
        </>} />
      {isLoading ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}</div> : !goals?.length ? (
        <section className="card-surface flex flex-col items-center px-6 py-10 text-center">
          <Panda pose="backpack" sizes="136px" className="w-32" />
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em]">What are you saving for?</h2>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">A laptop, an emergency fund, a trip home. Faldo tells you how much to set aside each month and when you&apos;ll get there.</p>
          <Button size="lg" className="mt-5" onClick={() => setCreating(true)}><Plus /> Create your first goal</Button>
        </section>
      ) : (
        <>
          {active.length > 1 && (
            <section aria-label="All goals" className="px-1">
              <p className="text-[0.9375rem] text-muted-foreground">Saved toward {active.length} goals</p>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <Money minor={totalSaved} className="display-xl" />
                <span className="tabular text-lg text-muted-foreground">of {formatMoney(totalTarget)}</span>
              </p>
              {monthly > 0 && <p className="mt-2 text-sm text-muted-foreground">You plan to add <span className="tabular font-medium text-foreground">{formatMoney(monthly)}</span> a month.</p>}
            </section>
          )}
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
