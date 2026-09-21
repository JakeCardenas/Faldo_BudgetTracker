"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { LargeTitle } from "@/components/ios/nav-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, minorToInput, toMinor } from "@/lib/format"
import { invalidateFinancialData, useMoneyPlan } from "@/lib/queries"
import type { MoneyPlan, MoneyPlanBucket } from "@/lib/types"
import { cn } from "@/lib/utils"

const COLORS: Record<MoneyPlanBucket["key"] | "unassigned", string> = {
  commitments: "var(--muted-foreground)",
  needs: "var(--primary)",
  joy: "var(--chart-4)",
  savings: "var(--chart-2)",
  buffer: "var(--chart-3)",
  unassigned: "var(--border)",
}

const HINTS: Record<MoneyPlanBucket["key"], string> = {
  commitments: "From your bills and subscriptions, per payday on average",
  needs: "Day-to-day essentials like groceries, fare and load",
  joy: "For wants. Spend it without guilt.",
  savings: "Goals and anything else you're putting away",
  buffer: "Optional. Tops up money for surprises.",
}

interface Draft { income: string; savings: string; joy: string; buffer: string; needs: string; needsManual: boolean; template: "custom" | "60_20_20" }

function toDraft(plan: MoneyPlan): Draft {
  return {
    income: minorToInput(plan.plan.income_minor), savings: minorToInput(plan.plan.savings_minor), joy: minorToInput(plan.plan.joy_minor),
    buffer: minorToInput(plan.plan.buffer_minor), needs: minorToInput(plan.plan.needs_minor), needsManual: plan.plan.needs_minor !== null,
    template: plan.plan.template === "60_20_20" ? "60_20_20" : "custom",
  }
}

function toBody(d: Draft) {
  return {
    income_minor: toMinor(d.income) || null, savings_minor: toMinor(d.savings) ?? 0, joy_minor: toMinor(d.joy) ?? 0,
    buffer_minor: toMinor(d.buffer) ?? 0, needs_minor: d.needsManual ? toMinor(d.needs) ?? 0 : null, template: d.template,
  }
}

function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function StackedBar({ plan }: { plan: MoneyPlan }) {
  const a = plan.allocation
  if (!a || !plan.income.minor) return null
  const parts = [...a.buckets.map((b) => ({ key: b.key, value: b.amount_minor, label: b.label })),
    ...(a.unassigned_minor > 0 ? [{ key: "unassigned" as const, value: a.unassigned_minor, label: "Not assigned" }] : [])]
  const total = Math.max(plan.income.minor, parts.reduce((s, p) => s + p.value, 0))
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img"
        aria-label={parts.map((p) => `${p.label} ${formatMoney(p.value)}`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: COLORS[p.key] }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.filter((p) => p.value > 0).map((p) => (
          <li key={p.key} className="flex items-center gap-1.5"><span className="size-2 rounded-[3px]" style={{ backgroundColor: COLORS[p.key] }} />{p.label}</li>
        ))}
      </ul>
    </div>
  )
}

function Row({ bucket, children, hint }: { bucket: MoneyPlanBucket; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: COLORS[bucket.key] }} />{bucket.label}
          {bucket.pct !== null && <span className="tabular text-xs font-normal text-muted-foreground">{bucket.pct}%</span>}
        </p>
        <p className="text-[0.8125rem] text-muted-foreground">{hint ?? HINTS[bucket.key]}</p>
      </div>
      <div className="w-full shrink-0 sm:w-44">{children}</div>
    </div>
  )
}

const WARNINGS: Record<string, (amount: string) => string> = {
  bills_exceed_income: (a) => `Your bills are ${a} more than this income. Safe to Spend still works from the money you actually have.`,
  over_assigned: (a) => `That's ${a} more than this income. Lower something until nothing is over.`,
  savings_below_goals: (a) => `Your goals plan ${a} more savings per payday than this. That's fine, just know your goals may take longer.`,
}

function PlanEditor({ plan }: { plan: MoneyPlan }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => toDraft(plan))
  const [saving, setSaving] = useState(false)
  const body = useMemo(() => toBody(draft), [draft])
  const debounced = useDebounced(body)
  const canPreview = !!(debounced.income_minor || plan.income.scheduled_minor)
  const { data: preview, isFetching } = useQuery({
    queryKey: ["money-plan-preview", debounced],
    queryFn: () => api.post<MoneyPlan>("/money-plan/preview", debounced),
    enabled: canPreview,
    placeholderData: keepPreviousData,
  })
  const view = preview ?? plan
  const a = view.allocation
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch, template: patch.template ?? "custom" }))
  const bucket = (key: MoneyPlanBucket["key"]) => a?.buckets.find((b) => b.key === key)

  async function save() {
    setSaving(true)
    try {
      await api.put("/money-plan", body)
      await invalidateFinancialData(qc)
      toast.success("Money plan saved. Your weekly figure on Home now follows it.")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save the plan.")
    } finally {
      setSaving(false)
    }
  }

  async function turnOff() {
    try {
      await api.delete("/money-plan")
      await invalidateFinancialData(qc)
      toast.success("Money plan turned off")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't turn it off.")
    }
  }

  function applyTemplate() {
    const t = view.template_60_20_20
    if (!t) return
    setDraft((d) => ({ ...d, savings: minorToInput(t.savings_minor), joy: minorToInput(t.joy_minor), buffer: "",
      needs: minorToInput(t.needs_minor), needsManual: false, template: "60_20_20" }))
  }

  return (
    <div className="space-y-5">
      <section className="card-surface space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="section-title">{view.period.label}</h2>
          <p className="text-[0.8125rem] text-muted-foreground">
            {view.period.has_schedule
              ? `Planned from your ${view.period.income_name} schedule. Change the amount if your take-home is different.`
              : "No regular income yet. Plan the money you work with each month, like an allowance or what you have now."}
          </p>
        </div>
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="mp-income">{view.period.has_schedule ? "Each payday" : "Each month"}</Label>
          <AmountInput id="mp-income" size="lg" value={draft.income} onValueChange={(v) => set({ income: v })}
            placeholder={plan.income.scheduled_minor ? minorToInput(plan.income.scheduled_minor) : "0"} />
        </div>
      </section>

      {!canPreview || !a ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Enter an amount to start your plan.</p>
      ) : (
        <section className={cn("card-surface p-4 transition-opacity sm:p-5", isFetching && "opacity-80")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Where it goes</h2>
              <p className="text-[0.8125rem] text-muted-foreground">You decide. Faldo does the arithmetic.</p>
            </div>
            <Button variant="outline" size="sm" onClick={applyTemplate}>Start from 60/20/20</Button>
          </div>
          <div className="mt-4"><StackedBar plan={view} /></div>

          <div className="mt-2 divide-y divide-border/60">
            {bucket("commitments") && (
              <Row bucket={bucket("commitments")!}>
                <p className="tabular text-right text-[0.9375rem] font-semibold">{formatMoney(view.commitments_minor)}</p>
                <Link href="/bills" className="block text-right text-xs text-primary hover:opacity-80">See bills</Link>
              </Row>
            )}
            {bucket("savings") && (
              <Row bucket={bucket("savings")!} hint={view.goal_savings_minor ? `Your goals plan ${formatMoney(view.goal_savings_minor)} per payday` : HINTS.savings}>
                <AmountInput value={draft.savings} onValueChange={(v) => set({ savings: v })} placeholder="0" aria-label="Savings" />
              </Row>
            )}
            {bucket("joy") && (
              <Row bucket={bucket("joy")!}>
                <AmountInput value={draft.joy} onValueChange={(v) => set({ joy: v })} placeholder="0" aria-label="Joy Money" />
              </Row>
            )}
            {bucket("buffer") && (
              <Row bucket={bucket("buffer")!}>
                <AmountInput value={draft.buffer} onValueChange={(v) => set({ buffer: v })} placeholder="0" aria-label="Buffer top-up" />
              </Row>
            )}
            {bucket("needs") && (
              <Row bucket={bucket("needs")!}>
                {draft.needsManual ? (
                  <AmountInput value={draft.needs} onValueChange={(v) => set({ needs: v })} placeholder="0" aria-label="Needs" />
                ) : (
                  <p className="tabular text-right text-[0.9375rem] font-semibold">{formatMoney(a.needs_minor)}</p>
                )}
                <label className="mt-1.5 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  Set it myself <Switch checked={draft.needsManual} onCheckedChange={(v) => set({ needsManual: v, needs: v ? minorToInput(a.needs_minor) : "" })} />
                </label>
              </Row>
            )}
          </div>

          <div className={cn("mt-2 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm",
            a.unassigned_minor < 0 ? "bg-danger-soft text-destructive" : a.unassigned_minor === 0 ? "bg-income-soft text-income" : "bg-muted")}>
            <span className="flex items-center gap-2 font-medium">
              {a.unassigned_minor === 0 && <Check className="size-4" />}
              {a.unassigned_minor === 0 ? "Every peso has a job" : a.unassigned_minor > 0 ? "Not assigned yet" : "More than this income"}
            </span>
            <Money minor={Math.abs(a.unassigned_minor)} className="font-semibold" />
          </div>
          {a.warnings.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {a.warnings.map((w) => (
                <li key={w.code} className="flex gap-2 text-[0.8125rem] text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> {WARNINGS[w.code]?.(formatMoney(w.amount_minor))}
                </li>
              ))}
            </ul>
          )}
          {view.weekly && (
            <p className="mt-4 text-[0.8125rem] text-muted-foreground">
              That&apos;s about <span className="tabular font-medium text-foreground">{formatMoney(view.weekly.joy_minor)}</span> Joy Money and{" "}
              <span className="tabular font-medium text-foreground">{formatMoney(view.weekly.needs_minor)}</span> for needs a week. Your weekly figure on Home follows this, but never goes past the money you actually have.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">60/20/20 is only a starting point: 60% for needs including bills, 20% Joy Money, 20% savings. Change anything.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {plan.configured && <Button variant="ghost" onClick={turnOff}>Turn off plan</Button>}
            <Button onClick={save} disabled={saving || (a.unassigned_minor < 0)}>{saving && <Loader2 className="animate-spin" />} {plan.configured ? "Save changes" : "Save plan"}</Button>
          </div>
        </section>
      )}
    </div>
  )
}

function ThisPeriod({ plan }: { plan: MoneyPlan }) {
  const p = plan.this_period
  if (!plan.configured || !p) return null
  const rows = [
    { label: "Joy Money", total: p.joy_minor, spent: p.joy_spent_minor, left: p.joy_left_minor, color: COLORS.joy },
    { label: "Needs", total: p.needs_minor, spent: p.needs_spent_minor, left: p.needs_left_minor, color: COLORS.needs },
  ]
  return (
    <section className="card-surface p-4 sm:p-5">
      <h2 className="section-title">This pay period</h2>
      <p className="text-[0.8125rem] text-muted-foreground">{formatDate(plan.period.start, "MMM d")} to {formatDate(plan.period.end, "MMM d")}</p>
      <div className="mt-4 space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="tabular text-muted-foreground">
                {r.left >= 0 ? <><span className="font-medium text-foreground">{formatMoney(r.left)}</span> left</> : <>{formatMoney(-r.left)} past the plan</>} of {formatMoney(r.total)}
              </span>
            </div>
            <ProgressBar className="mt-1.5" value={r.total > 0 ? (r.spent / r.total) * 100 : r.spent > 0 ? 100 : 0} status={r.left < 0 ? "over" : "on_track"} label={`${r.label} used`} />
          </div>
        ))}
      </div>
    </section>
  )
}

function NeedsOrWants({ plan }: { plan: MoneyPlan }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  async function toggle(id: string, essential: boolean) {
    setBusy(id)
    try {
      await api.patch(`/categories/${id}`, { is_essential: essential })
      await Promise.all([invalidateFinancialData(qc), qc.invalidateQueries({ queryKey: ["categories"] })])
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update.")
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="card-surface p-4 sm:p-5">
      <h2 className="section-title">What counts as a need?</h2>
      <p className="text-[0.8125rem] text-muted-foreground">Spending in these categories comes from Needs. Everything else comes from Joy Money. Eating out can be a need; you decide.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {plan.categories.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.is_essential} disabled={busy === c.id} onClick={() => toggle(c.id, !c.is_essential)}
            className={cn("pressable inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
              c.is_essential ? "border-primary/45 bg-secondary text-secondary-foreground" : "bg-card text-muted-foreground hover:bg-accent/60")}>
            {c.is_essential && <Check className="size-3.5" />}{c.name}
          </button>
        ))}
      </div>
    </section>
  )
}

export default function MoneyPlanPage() {
  const { data: plan, isLoading, error } = useMoneyPlan()
  return (
    <div className="space-y-5">
      <LargeTitle title="Money plan" subtitle="Give every payday a job" back={{ href: "/plan", label: "Plan" }} />
      {error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-destructive">Couldn&apos;t load your plan. {error.message}</p>
        : isLoading || !plan ? <div className="space-y-4"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-96 rounded-xl" /></div> : (
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <PlanEditor key={`${plan.configured}-${plan.plan.template}`} plan={plan} />
            <div className="space-y-5">
              <ThisPeriod plan={plan} />
              <NeedsOrWants plan={plan} />
            </div>
          </div>
        )}
    </div>
  )
}
