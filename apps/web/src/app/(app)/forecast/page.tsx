"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { AlertTriangle, CalendarDays, FlaskConical, Info, LineChart, Minus, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { ForecastChart } from "@/components/charts/charts"
import { AmountInput } from "@/components/finance/amount-input"
import { CalculationCard, RiskBadge } from "@/components/finance/calculation-card"
import { EmptyState } from "@/components/finance/empty-state"
import { untilPhrase } from "@/components/home/safe-to-spend"
import { Money } from "@/components/finance/money"
import { PageHeader, SectionCard } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, toMinor, todayISO } from "@/lib/format"
import { useCategories, useForecast } from "@/lib/queries"
import type { ScenarioResult } from "@/lib/types"
import { cn } from "@/lib/utils"

type AdjustmentKind = "one_time_expense" | "one_time_income" | "extra_savings" | "reduce_savings" | "income_decrease"
type Repeat = "once" | "daily" | "weekly" | "monthly"
type Horizon = "end_of_month" | "90_days" | "6_months" | "12_months"
interface Draft { kind: AdjustmentKind; amount: string; date: string; label: string; categoryId: string; repeat: Repeat }

const KIND_LABELS: Record<AdjustmentKind, string> = {
  one_time_expense: "I spend", one_time_income: "I receive", extra_savings: "I save extra", reduce_savings: "I save less",
  income_decrease: "I earn less",
}
const REPEAT_LABELS: Record<Repeat, string> = { once: "Once", daily: "Every day", weekly: "Every week", monthly: "Every month" }
const HORIZON_LABELS: Record<Horizon, string> = { end_of_month: "End of month", "90_days": "3 months", "6_months": "6 months", "12_months": "12 months" }
const PRESETS: { label: string; draft: Partial<Draft>; horizon: Horizon }[] = [
  { label: "Buy ₱5,999 headphones", draft: { kind: "one_time_expense", amount: "5999", label: "Headphones" }, horizon: "end_of_month" },
  { label: "₱200 a day on food", draft: { kind: "one_time_expense", amount: "200", label: "Food", repeat: "daily" }, horizon: "end_of_month" },
  { label: "Save ₱2,000 every month", draft: { kind: "extra_savings", amount: "2000", label: "Extra savings", repeat: "monthly" }, horizon: "12_months" },
  { label: "Income drops ₱5,000", draft: { kind: "income_decrease", amount: "5000", label: "Less income", repeat: "monthly" }, horizon: "6_months" },
]
const EMPTY: Draft = { kind: "one_time_expense", amount: "", date: "", label: "", categoryId: "__none__", repeat: "once" }
const REASONS: Record<string, string> = {
  negative_balance: "Your spendable balance could go below zero.",
  below_buffer: "It leaves less than your safety buffer.",
  downside_negative: "If spending runs higher than usual, you could go negative.",
  budget_exceeded: "It would push a budget category over its limit.",
  limited_history: "There's limited history, so the estimate is less reliable.",
}
const NONE = "__none__"

function Simulator() {
  const { data: categories = [] } = useCategories()
  const [drafts, setDrafts] = useState<Draft[]>([{ ...EMPTY, amount: "5999", label: "Headphones" }])
  const [horizon, setHorizon] = useState<Horizon>("end_of_month")
  const run = useMutation({
    mutationFn: () => api.post<ScenarioResult>("/forecast/scenario", {
      horizon,
      adjustments: drafts.filter((d) => toMinor(d.amount)).map((d) => ({
        kind: d.kind, amount_minor: toMinor(d.amount), date: d.date || null, label: d.label || null, repeat: d.repeat,
        category_id: d.categoryId === NONE ? null : d.categoryId,
      })),
    }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Simulation failed."),
  })
  const result = run.data
  const update = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))

  return (
    <SectionCard title={<span className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" /> What-if simulator</span>}
      description="Test a decision against your real balance, bills, savings plan and spending pattern.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => { setDrafts([{ ...EMPTY, ...p.draft }]); setHorizon(p.horizon); run.reset() }}
                className="rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground">{p.label}</button>
            ))}
          </div>
          {drafts.map((d, i) => (
            <div key={i} className="space-y-3 rounded-xl border bg-surface p-3">
              <div className="flex gap-2">
                <Select value={d.kind} onValueChange={(v) => update(i, { kind: v as AdjustmentKind })}>
                  <SelectTrigger className="w-36 bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(KIND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <AmountInput value={d.amount} onValueChange={(v) => update(i, { amount: v })} className="flex-1" aria-label="Amount" placeholder="0" />
                {drafts.length > 1 && <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setDrafts(drafts.filter((_, idx) => idx !== i))}><Minus /></Button>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">How often</Label>
                  <Select value={d.repeat} onValueChange={(v) => update(i, { repeat: v as Repeat })}>
                    <SelectTrigger className="w-full bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(REPEAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">{d.repeat === "once" ? "When" : "Starting"}</Label><Input type="date" min={todayISO()} value={d.date} onChange={(e) => update(i, { date: e.target.value })} className="bg-card" /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Label</Label><Input value={d.label} maxLength={60} onChange={(e) => update(i, { label: e.target.value })} className="bg-card" placeholder="Optional" /></div>
              {d.kind === "one_time_expense" && (
                <Select value={d.categoryId} onValueChange={(v) => update(i, { categoryId: v })}>
                  <SelectTrigger className="w-full bg-card"><SelectValue placeholder="Budget category" /></SelectTrigger>
                  <SelectContent><SelectItem value={NONE}>No budget category</SelectItem>{categories.filter((c) => c.kind === "expense" && !c.parent_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Select value={horizon} onValueChange={(v) => setHorizon(v as Horizon)}>
              <SelectTrigger className="w-36" aria-label="Look ahead to"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(HORIZON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            {drafts.length < 5 && <Button variant="ghost" onClick={() => setDrafts([...drafts, { ...EMPTY }])}><Plus /> Add change</Button>}
            <Button className="ml-auto" onClick={() => run.mutate()} disabled={run.isPending || !drafts.some((d) => toMinor(d.amount))}>{run.isPending ? "Simulating…" : "Run simulation"}</Button>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {!result ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
              <FlaskConical className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Run a scenario to see its impact</p>
              <p className="max-w-xs text-xs text-muted-foreground">Faldo recalculates your projected balance, budget impact and savings risk. Repeating changes add up over the period you pick.</p>
            </div>
          ) : (
            <div className="animate-rise space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Projected balance on {formatDate(result.horizon_end, "MMM d")}</p>
                  <p className="text-3xl font-semibold tracking-[-0.025em]"><Money minor={result.projected_minor} className={result.projected_minor < 0 ? "text-destructive" : ""} /></p>
                  <p className="text-sm text-muted-foreground">{formatMoney(result.delta_minor, "PHP", { signed: true })} vs. without this change</p>
                </div>
                <RiskBadge level={result.risk_level} verdict={result.verdict} />
              </div>
              <ForecastChart series={result.scenario_series} baseline={result.baseline_series} bufferMinor={result.buffer_minor} height={220} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <CalculationCard title="How Faldo calculated this" lines={result.lines} resultLabel="Projected balance" resultMinor={result.projected_minor} />
                <div className="space-y-3">
                  {result.reasons.length > 0 && (
                    <div className="space-y-2 rounded-xl border p-4">
                      <p className="text-sm font-medium">Why this risk level</p>
                      <ul className="space-y-1.5">{result.reasons.map((r) => <li key={r.code} className="flex gap-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />{REASONS[r.code] ?? r.code}</li>)}</ul>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Savings at risk</p><Money minor={result.savings_at_risk_minor} className="text-lg font-semibold" /></div>
                    <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Goal delay</p><p className="text-lg font-semibold">{result.goal_delay_days ? `~${result.goal_delay_days} days` : "None"}</p></div>
                  </div>
                  {result.budget_impacts.map((b) => (
                    <div key={b.category} className={cn("rounded-xl border p-4 text-sm", b.remaining_after_minor < 0 && "border-destructive/30 bg-danger-soft/50")}>
                      <p className="font-medium">{b.category} budget</p>
                      <p className="text-muted-foreground">{formatMoney(b.remaining_before_minor)} left now → {b.remaining_after_minor < 0 ? <span className="text-destructive">{formatMoney(-b.remaining_after_minor)} over</span> : `${formatMoney(b.remaining_after_minor)} left`}</p>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Likely range {formatMoney(result.range.p10)} to {formatMoney(result.range.p90)}. Simulations are estimates, not guarantees.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}

export default function ForecastPage() {
  const [horizon, setHorizon] = useState("end_of_month")
  const { data, isLoading } = useForecast(horizon)

  return (
    <div className="space-y-5">
      <PageHeader title="Forecast" description="Where your spendable balance is likely headed, based on scheduled bills, income and your spending pattern."
        actions={<Tabs value={horizon} onValueChange={setHorizon}><TabsList>
          <TabsTrigger value="end_of_month">Month end</TabsTrigger><TabsTrigger value="30_days">30d</TabsTrigger><TabsTrigger value="60_days">60d</TabsTrigger><TabsTrigger value="90_days">90d</TabsTrigger>
        </TabsList></Tabs>} />
      <div className="flex items-start gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>Projections are <span className="font-medium text-foreground">estimates</span>. The shaded band shows the likely range from simulating your recent daily spending.</span>
      </div>
      {isLoading || !data ? <Skeleton className="h-96 rounded-xl" /> : data.sufficiency === "insufficient" ? (
        <div className="card-surface"><EmptyState icon={LineChart} title="Forecast unlocks soon" description={`Faldo needs at least a week of transactions to project your balance. You have ${data.history_days} day${data.history_days === 1 ? "" : "s"} so far.`} /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card-surface p-5"><p className="text-sm text-muted-foreground">Spendable now</p><Money minor={data.start_balance_minor} className="text-2xl font-semibold tracking-[-0.025em]" /></div>
            <div className="card-surface p-5"><p className="text-sm text-muted-foreground">Projected {formatDate(data.horizon_end, "MMM d")}</p><Money minor={data.end_balance.p50} className="block text-2xl font-semibold tracking-[-0.025em]" /><p className="text-xs text-muted-foreground">Likely {formatMoney(data.end_balance.p10)} to {formatMoney(data.end_balance.p90)}</p></div>
            <div className="card-surface p-5"><p className="text-sm text-muted-foreground">Lowest point</p><Money minor={data.lowest_point.p50_minor} className={cn("text-2xl font-semibold tracking-[-0.025em]", data.lowest_point.p50_minor < data.buffer_minor && "text-warning")} /><p className="text-xs text-muted-foreground">around {formatDate(data.lowest_point.date, "MMM d")}</p></div>
            <div className="card-surface p-5"><p className="text-sm text-muted-foreground">Safe to spend</p><Money minor={data.safe_to_spend.amount_minor} className="text-2xl font-semibold tracking-[-0.025em]" /><p className="text-xs text-muted-foreground">≈{formatMoney(data.safe_to_spend.per_day_minor)}/day {untilPhrase(data.safe_to_spend)}</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_22rem]">
            <SectionCard title="Projected spendable balance" description={data.sufficiency === "low" ? "Limited history. Treat this range with caution." : `Based on ${data.history_days} days of history`}>
              <ForecastChart series={data.days} actual={data.actual} bufferMinor={data.buffer_minor} />
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-chart-1" /> Actual</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-chart-2" /> Projected</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-chart-2/20" /> Likely range</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-warning/60" /> Safety buffer</span>
              </div>
            </SectionCard>
            <div className="space-y-4">
              <CalculationCard title={`Safe to spend ${untilPhrase(data.safe_to_spend)}`} lines={data.safe_to_spend.lines} resultLabel="Safe to spend" resultMinor={data.safe_to_spend.raw_minor} note={data.safe_to_spend.note} />
              <SectionCard title="Scheduled" description="Bills, income and savings in the window" bodyClassName="pt-2">
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {data.events.length === 0 && <li className="text-sm text-muted-foreground">Nothing scheduled.</li>}
                  {data.events.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CalendarDays className="size-3.5 text-muted-foreground" />
                      <span className="w-14 text-xs text-muted-foreground">{formatDate(e.date, "MMM d")}</span>
                      <span className="min-w-0 flex-1 truncate">{e.label}
                        {e.kind === "expected_income" && <span className="ml-1.5 text-xs text-muted-foreground">expected, may not arrive</span>}
                        {e.kind === "planned" && <span className="ml-1.5 text-xs text-muted-foreground">planned purchase</span>}
                      </span>
                      <Money minor={e.amount_minor} signed className={cn("text-sm", e.amount_minor > 0 && "text-income")} />
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          </div>
          <SectionCard title="Assumptions" bodyClassName="pt-2">
            <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">{data.assumptions.map((a) => <li key={a} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />{a}</li>)}</ul>
          </SectionCard>
        </>
      )}
      <Simulator />
      <div className="flex justify-center">
        <Button asChild variant="ghost"><Link href="/assistant?q=What%20happens%20if%20I%20spend%20%E2%82%B15%2C000%20this%20weekend%3F"><Sparkles /> Ask the assistant a what-if question</Link></Button>
      </div>
    </div>
  )
}
