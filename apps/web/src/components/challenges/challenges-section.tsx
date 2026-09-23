"use client"

import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Ban, CalendarRange, CheckCircle2, ChevronLeft, Flame, Gauge, Loader2, PiggyBank, Plus, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { ProgressBar } from "@/components/finance/progress-bar"
import { IosSheet } from "@/components/ios/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatMoney, toMinor } from "@/lib/format"
import { invalidateFinancialData, useCategories, useChallenges } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { ChallengeProgress } from "@/lib/types"
import { cn } from "@/lib/utils"

type Kind = ChallengeProgress["kind"]

const KINDS: { kind: Kind; title: string; blurb: string; icon: LucideIcon; amount?: { label: string; start: string }; days?: number[] }[] = [
  { kind: "ipon_daily", title: "Daily ipon", blurb: "Save the same amount every day.", icon: PiggyBank,
    amount: { label: "Save each day", start: "50" }, days: [14, 30, 60, 100] },
  { kind: "ipon_52", title: "52-week ipon", blurb: "Week 1 saves the base amount, week 2 twice that, all the way to week 52.", icon: CalendarRange,
    amount: { label: "Base amount", start: "20" } },
  { kind: "no_spend", title: "No-spend", blurb: "Go a stretch without spending in one category, or on anything non-essential.", icon: Ban,
    days: [3, 7, 14, 30] },
  { kind: "spend_cap", title: "Spending cap", blurb: "Keep one category under a cap.", icon: Gauge,
    amount: { label: "Cap", start: "3000" }, days: [7, 14, 30] },
]
const ANY = "__any__"

function StartChallengeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: categories = [] } = useCategories()
  const spending = categories.filter((c) => c.kind === "expense" && !c.parent_id)
  const [kind, setKind] = useState<Kind | null>(null)
  const [amount, setAmount] = useState("")
  const [days, setDays] = useState(30)
  const [category, setCategory] = useState(ANY)
  const [busy, setBusy] = useState(false)
  const chosen = KINDS.find((k) => k.kind === kind)
  const minor = toMinor(amount)
  const total = kind === "ipon_daily" && minor ? minor * days : kind === "ipon_52" && minor ? minor * 1378 : null
  const ready = chosen && (!chosen.amount || minor) && (kind !== "spend_cap" || category !== ANY)

  function pick(next: (typeof KINDS)[number]) {
    play("tap")
    setKind(next.kind)
    setAmount(next.amount?.start ?? "")
    setDays(next.days?.includes(30) ? 30 : next.days?.[1] ?? 7)
    setCategory(ANY)
  }

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!chosen || !ready) return
    setBusy(true)
    try {
      await api.post("/challenges", {
        kind, amount_minor: chosen.amount ? minor : null, days: kind === "ipon_52" ? 364 : days,
        category_id: category === ANY ? null : category,
      })
      await invalidateFinancialData(qc)
      play("celebrate")
      toast.success("Challenge started. Faldo will check in on it.")
      setKind(null)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't start it.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <IosSheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setKind(null) }} size="sm"
      title={chosen ? chosen.title : "Start a challenge"} description={chosen ? chosen.blurb : "Faldo tracks it from your real records and checks in with you."}>
      {!chosen ? (
        <ul className="space-y-2">
          {KINDS.map((k) => (
            <li key={k.kind}>
              <button type="button" onClick={() => pick(k)} className="pressable flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-accent/60">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><k.icon className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold">{k.title}</span>
                  <span className="block text-[0.8125rem] leading-snug text-muted-foreground">{k.blurb}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <form onSubmit={start} className="space-y-4">
          {chosen.amount && (
            <div className="space-y-1.5"><Label htmlFor="ch-amount">{chosen.amount.label}</Label>
              <AmountInput id="ch-amount" required value={amount} onValueChange={setAmount} /></div>
          )}
          {(kind === "no_spend" || kind === "spend_cap") && (
            <div className="space-y-1.5"><Label>Category</Label>
              <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kind === "no_spend" && <SelectItem value={ANY}>Anything non-essential</SelectItem>}
                  {kind === "spend_cap" && <SelectItem value={ANY} disabled>Pick a category</SelectItem>}
                  {spending.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select></div>
          )}
          {chosen.days && (
            <div className="space-y-1.5"><Label>How long</Label>
              <div className="flex gap-2" role="radiogroup" aria-label="How long">
                {chosen.days.map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)}
                    className={cn("pressable h-9 flex-1 rounded-full text-[0.8125rem] font-semibold", days === d ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                    {d} days
                  </button>
                ))}
              </div></div>
          )}
          {total ? <p className="rounded-xl bg-secondary/70 px-3 py-2.5 text-sm">You&apos;ll have <b className="tabular">{formatMoney(total)}</b> {kind === "ipon_52" ? "after 52 weeks" : `after ${days} days`}. It saves into its own goal, so add money there as you go.</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => setKind(null)} aria-label="Back to challenges"><ChevronLeft /></Button>
            <Button type="submit" size="lg" className="flex-1" disabled={busy || !ready}>{busy && <Loader2 className="animate-spin" />} Start challenge</Button>
          </div>
        </form>
      )}
    </IosSheet>
  )
}

/** Challenges Faldo tracks with you: progress from your real records, today's next step, and a way to start a new one. */
export function ChallengesSection() {
  const qc = useQueryClient()
  const { data: challenges, isLoading } = useChallenges()
  const [starting, setStarting] = useState(false)

  async function end(id: string) {
    try {
      await api.post(`/challenges/${id}/end`)
      await invalidateFinancialData(qc)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't end it.")
    }
  }

  return (
    <section className="card-surface p-4 sm:p-5" aria-labelledby="challenges-title">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="challenges-title" className="section-title">Challenges</h2>
          <p className="text-[0.8125rem] text-muted-foreground">Ipon, no-spend and spending caps, tracked from your records.</p>
        </div>
        <Button size="sm" onClick={() => setStarting(true)}><Plus /> Start</Button>
      </div>
      {isLoading ? <Skeleton className="mt-4 h-20 rounded-xl" /> : !challenges?.length ? (
        <p className="mt-4 rounded-xl bg-secondary/60 px-3 py-3 text-sm text-muted-foreground">No challenge yet. A daily ipon or a no-spend week is a good first try.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border/70">
          {challenges.map((c) => (
            <li key={c.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-1.5 text-[0.9375rem] font-semibold tracking-[-0.01em]">
                  {c.state === "completed" ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <Flame className={cn("size-4 shrink-0", c.on_track ? "text-primary" : "text-warning")} />}
                  <span className="truncate">{c.title}</span>
                </p>
                <p className="tabular shrink-0 text-xs text-muted-foreground">
                  {c.state === "completed" ? "Done" : c.state === "missed" || c.status === "ended" ? "Ended" : `${c.days_left} days left`}
                </p>
              </div>
              <ProgressBar className="mt-2 h-2" value={c.pct} status={c.state === "missed" ? "over" : c.on_track ? "on_track" : "near_limit"} label={`${c.title} ${Math.round(c.pct)}%`} />
              <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{c.summary}{c.next_step ? ` · ${c.next_step}` : ""}</p>
              {c.state === "active" && c.status === "active" && (
                <div className="mt-2 flex gap-2">
                  {c.goal_id && <Link href="/goals" className="pressable inline-flex h-8 items-center rounded-full bg-primary px-3 text-[0.8125rem] font-medium text-primary-foreground">Add savings</Link>}
                  <Link href={`/assistant?q=${encodeURIComponent(`How is my ${c.title} going?`)}`} className="pressable inline-flex h-8 items-center rounded-full bg-muted px-3 text-[0.8125rem] font-medium">Ask Faldo</Link>
                  <button type="button" onClick={() => end(c.id)} className="pressable ml-auto inline-flex h-8 items-center rounded-full px-2.5 text-[0.8125rem] text-muted-foreground hover:bg-accent">End</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <StartChallengeSheet open={starting} onOpenChange={setStarting} />
    </section>
  )
}
