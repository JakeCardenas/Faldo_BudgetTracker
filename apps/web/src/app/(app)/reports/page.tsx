"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { addMonths, format, parse } from "date-fns"
import Link from "next/link"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import {
  Activity, ArrowDownRight, ArrowLeftRight, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, FileText, HeartPulse, Info, LineChart, Printer, TrendingDown, TrendingUp,
} from "lucide-react"
import { DailyBars, IncomeExpenseBars } from "@/components/charts/charts"
import { Mascot } from "@/components/brand/mascot"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { Delta } from "@/components/finance/stat"
import { Donut } from "@/components/home/cards"
import { LargeTitle } from "@/components/ios/nav-header"
import { Segmented } from "@/components/ios/segmented"
import { StatTile } from "@/components/ios/stat-tile"
import { SectionCard } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate, formatMoney, formatPct, monthKey } from "@/lib/format"
import { useBalanceHistory, useForecast, useMe, useReport } from "@/lib/queries"
import type { Health, MonthlyReport } from "@/lib/types"
import { cn } from "@/lib/utils"

function HealthPanel({ health }: { health: Health }) {
  const ring = health.score ?? 0
  return (
    <SectionCard title={<span className="flex items-center gap-2"><HeartPulse className="size-4 text-primary" /> Financial health</span>} description={`Formula ${health.formula_version} · transparent and based only on your Faldo data`}>
      {health.score === null ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Not enough data yet. The score needs about 60 days of history and at least three measurable factors ({health.history_days} days so far).</p>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[12rem_1fr]">
        {health.score !== null && (
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="relative size-36">
              <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--muted)" strokeWidth="10" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${(ring / 100) * 326.7} 326.7`} className="transition-[stroke-dasharray] duration-1000" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-semibold tracking-tight">{health.score}</span>
                <span className="text-xs text-muted-foreground">of 100</span>
              </div>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-primary">{health.label}</span>
          </div>
        )}
        <ul className={cn("grid gap-3 sm:grid-cols-2", health.score === null && "lg:col-span-2")}>
          {health.components.map((c) => (
            <li key={c.key} className={cn("space-y-2 rounded-xl border p-3", !c.counted && "bg-muted/40")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="tabular text-sm">{c.score !== null ? c.score : <span className="text-xs text-muted-foreground">Not counted</span>}</span>
              </div>
              {c.score !== null && <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${c.score}%` }} /></div>}
              <p className="text-xs text-muted-foreground">{c.explanation}</p>
              <p className="text-[0.7rem] text-muted-foreground/80">Weight {Math.round((c.effective_weight ?? c.weight) * 100)}% · {c.measure}{c.value !== null && ` = ${c.value}`}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 flex gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{health.disclaimer}</p>
    </SectionCard>
  )
}

function NetWorthTrend() {
  const [range, setRange] = useState<"30" | "90" | "365">("90")
  const { data: history } = useBalanceHistory(Number(range))
  const current = history?.at(-1)?.net_minor ?? 0
  const change = history?.length ? current - history[0].net_minor : 0
  return (
    <section className="card-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold tracking-tight">Net worth trend</h2>
          <p className="text-xs text-muted-foreground">Track wallet net worth across a custom range</p>
        </div>
        <Segmented label="Range" size="sm" value={range} onChange={setRange} options={[{ value: "30", label: "30D" }, { value: "90", label: "90D" }, { value: "365", label: "1Y" }]} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted/60 p-3"><p className="eyebrow">Current</p><Money minor={current} className={cn("text-lg font-extrabold", current < 0 && "text-expense")} /></div>
        <div className="rounded-2xl bg-muted/60 p-3"><p className="eyebrow">Range change</p><Money minor={change} signed className={cn("text-lg font-extrabold", change >= 0 ? "text-income" : "text-expense")} /></div>
      </div>
      {history ? (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={history} margin={{ top: 14, left: 0, right: 0, bottom: 0 }}>
            <defs><linearGradient id="nw-trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="date" hide />
            <Tooltip formatter={(v) => formatMoney(Number(v))} labelFormatter={(d) => formatDate(String(d))}
              contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
            <Area dataKey="net_minor" name="Net worth" stroke="var(--primary)" strokeWidth={2.2} fill="url(#nw-trend)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <Skeleton className="mt-3 h-40 rounded-xl" />}
    </section>
  )
}

function IncomeStatement({ report }: { report: MonthlyReport }) {
  const s = report.summary
  return (
    <section id="income-statement" className="card-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary"><FileText className="size-5" /></span>
          <div>
            <h2 className="text-base font-extrabold tracking-tight">Income statement</h2>
            <p className="text-xs text-muted-foreground">{report.label}{report.is_partial && " (so far)"}</p>
          </div>
        </div>
        <button type="button" onClick={() => window.print()} className="pressable flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-bold print:hidden">
          <Printer className="size-3.5" /> Print / PDF
        </button>
      </div>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <p className="eyebrow text-income">Income</p>
          <ul className="mt-1 divide-y divide-border/60">
            {report.income_by_category.map((r) => <li key={r.label} className="flex justify-between py-1.5"><span>{r.label}</span><Money minor={r.amount_minor} /></li>)}
            {report.income_by_category.length === 0 && <li className="py-1.5 text-muted-foreground">No income recorded</li>}
          </ul>
          <p className="flex justify-between border-t-2 pt-1.5 font-extrabold"><span>Total income</span><Money minor={s.income_minor} /></p>
        </div>
        <div>
          <p className="eyebrow text-expense">Expenses</p>
          <ul className="mt-1 divide-y divide-border/60">
            {report.spending_by_category.map((r) => <li key={r.label} className="flex justify-between py-1.5"><span>{r.label}</span><Money minor={r.amount_minor} /></li>)}
          </ul>
          <p className="flex justify-between border-t-2 pt-1.5 font-extrabold"><span>Total expenses</span><Money minor={s.expense_minor} /></p>
        </div>
        <p className={cn("flex justify-between rounded-2xl px-4 py-3 text-base font-extrabold", s.net_minor >= 0 ? "bg-income-soft text-income" : "bg-expense-soft text-expense")}>
          <span>Net {s.net_minor >= 0 ? "savings" : "shortfall"}</span><Money minor={s.net_minor} signed />
        </p>
      </div>
    </section>
  )
}

export default function ReportsPage() {
  const [month, setMonth] = useState(monthKey())
  const { data: me } = useMe()
  const { data: report, isLoading } = useReport(month)
  const { data: forecast } = useForecast("end_of_month")
  const summary = useQuery({ queryKey: ["report", "summary", month], queryFn: () => api.get<{ text: string; generated_by: string }>("/reports/summary", { month }) })
  const monthDate = parse(month, "yyyy-MM", new Date())
  const s = report?.summary
  const top = report?.spending_by_category[0]

  const switcher = (
    <div className="flex h-9 items-center rounded-full border bg-card shadow-(--shadow-card)">
      <button type="button" className="flex size-9 items-center justify-center rounded-full text-primary" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(monthDate, -1)))}><ChevronLeft className="size-4" /></button>
      <span className="w-20 text-center text-xs font-bold">{format(monthDate, "MMM yyyy")}</span>
      <button type="button" className="flex size-9 items-center justify-center rounded-full text-primary disabled:opacity-30" aria-label="Next month" disabled={month >= monthKey()} onClick={() => setMonth(monthKey(addMonths(monthDate, 1)))}><ChevronRight className="size-4" /></button>
    </div>
  )

  return (
    <div className="space-y-5">
      <LargeTitle title="Statistics" subtitle="Your financial patterns and trends" back={{ href: "/", label: "Home" }} actions={switcher} />

      {isLoading || !report || !s ? <div className="space-y-4"><Skeleton className="h-28 rounded-[1.5rem]" /><div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[1.5rem]" />)}</div></div> : s.transaction_count === 0 ? (
        <div className="card-surface"><EmptyState icon={BarChart3} title={`No activity in ${report.label}`} description="Statistics fill in as you record transactions." /></div>
      ) : (
        <div className="stagger space-y-4">
          <div className="flex items-end gap-2">
            <Mascot outfit={me?.settings.mascot_outfit} coin={false} className="w-16 shrink-0 sm:w-20" />
            <div className="mb-2 min-w-0 flex-1 rounded-[1.4rem] rounded-bl-md border bg-card p-4 shadow-(--shadow-card)">
              <p className="text-xs font-extrabold text-primary">{report.label}{report.is_partial && " so far"}</p>
              {summary.data ? <p className="mt-1 text-sm leading-relaxed">{summary.data.text}</p> : <div className="mt-2 space-y-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-3/4" /></div>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile icon={TrendingDown} tone="expense" label="Spent" value={<Money minor={s.expense_minor} />} footer={<Delta pct={s.expense_change_pct} goodWhen="down" suffix="" />} />
            <StatTile icon={TrendingUp} tone="income" label="Income" value={<Money minor={s.income_minor} />} footer={<Delta pct={s.income_change_pct} suffix="" />} />
            <StatTile icon={ArrowLeftRight} label="Net flow" value={<Money minor={s.net_minor} className={cn(s.net_minor < 0 && "text-expense")} />} footer={`Savings rate ${formatPct(s.savings_rate)}`} />
            <StatTile icon={Activity} tone="neutral" label="Transactions" value={s.transaction_count} footer={`≈${formatMoney(s.average_daily_spend_minor)}/day spent`} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="card-surface p-4 sm:p-5">
              <h2 className="text-base font-extrabold tracking-tight">Expense distribution</h2>
              <p className="text-xs text-muted-foreground">How your spending splits across categories</p>
              <div className="mt-4 flex items-center gap-5">
                <Donut size="size-36" data={report.spending_by_category.map((r) => ({ value: r.amount_minor, color: r.color }))}
                  center={top ? <><span className="tabular text-2xl font-extrabold">{Math.round(top.pct)}%</span><span className="max-w-20 truncate text-xs text-muted-foreground">{top.label}</span></> : null} />
                <ul className="min-w-0 flex-1 space-y-2">
                  {report.spending_by_category.slice(0, 6).map((r) => (
                    <li key={r.label} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <Money minor={r.amount_minor} className="font-bold" />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <NetWorthTrend />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Recent activity" description="Daily spending this month"><DailyBars data={report.daily_spending} /></SectionCard>
            <SectionCard title="Income vs expenses" description="Last 12 months"><IncomeExpenseBars data={report.history} /></SectionCard>
          </div>

          <Link href="/forecast" className="card-surface pressable block p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary"><LineChart className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-extrabold tracking-tight">View your cashflow forecast</h2>
                <p className="text-xs text-muted-foreground">Everything expected until month end, ordered by date</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </div>
            {forecast && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-income-soft p-2.5"><p className="eyebrow text-income">Expected in</p><Money minor={forecast.expected_income_minor} className="text-sm font-extrabold" /></div>
                <div className="rounded-2xl bg-expense-soft p-2.5"><p className="eyebrow text-expense">Expected out</p><Money minor={forecast.scheduled_outflows_minor + forecast.projected_discretionary_minor} className="text-sm font-extrabold" /></div>
                <div className="rounded-2xl bg-muted/60 p-2.5"><p className="eyebrow">Month end</p><Money minor={forecast.end_balance.p50} className="text-sm font-extrabold" /></div>
              </div>
            )}
          </Link>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
            <IncomeStatement report={report} />
            <div className="space-y-4">
              <SectionCard title="Biggest changes" description="Compared with the same days of the prior month">
                <ul className="space-y-2.5">
                  {report.category_changes.length === 0 && <li className="text-sm text-muted-foreground">No changes to compare.</li>}
                  {report.category_changes.slice(0, 5).map((c) => (
                    <li key={c.key} className="flex items-center gap-2 text-sm">
                      {c.delta_minor > 0 ? <ArrowUpRight className="size-4 text-expense" /> : <ArrowDownRight className="size-4 text-income" />}
                      <span className="flex-1 truncate">{c.label}</span>
                      <span className={cn("tabular text-right font-bold", c.delta_minor > 0 ? "text-expense" : "text-income")}>{formatMoney(c.delta_minor, "PHP", { signed: true })}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
              <SectionCard title="Top merchants">
                <ol className="space-y-2.5">
                  {report.top_merchants.slice(0, 5).map((m, i) => (
                    <li key={m.merchant_id} className="flex items-center gap-3 text-sm">
                      <span className="tabular flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                      <span className="flex-1 truncate font-semibold">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{m.count}×</span>
                      <Money minor={m.amount_minor} className="w-24 text-right font-bold" />
                    </li>
                  ))}
                </ol>
              </SectionCard>
              {report.top_items.length > 0 && (
                <SectionCard title="Top purchase items">
                  <ol className="space-y-2.5">
                    {report.top_items.slice(0, 5).map((item, i) => (
                      <li key={item.name} className="flex items-center gap-3 text-sm">
                        <span className="tabular flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                        <span className="flex-1 truncate font-semibold">{item.name}</span>
                        <Money minor={item.amount_minor} className="w-24 text-right font-bold" />
                      </li>
                    ))}
                  </ol>
                </SectionCard>
              )}
            </div>
          </div>

          <HealthPanel health={report.health} />
        </div>
      )}
    </div>
  )
}
