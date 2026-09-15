"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { addMonths, format, parse } from "date-fns"
import Link from "next/link"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import {
  Activity, ArrowDownRight, ArrowLeftRight, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Info, LineChart, Printer, TrendingDown, TrendingUp,
} from "lucide-react"
import { DailyBars, IncomeExpenseBars } from "@/components/charts/charts"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { Delta } from "@/components/finance/stat"
import { Donut } from "@/components/home/cards"
import { LargeTitle } from "@/components/ios/nav-header"
import { Segmented } from "@/components/ios/segmented"
import { StatTile } from "@/components/ios/stat-tile"
import { SectionCard } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate, formatMoney, formatPct, monthKey } from "@/lib/format"
import { useBalanceHistory, useForecast, useReport } from "@/lib/queries"
import type { Health, MonthlyReport } from "@/lib/types"
import { cn } from "@/lib/utils"

function HealthPanel({ health }: { health: Health }) {
  const ring = health.score ?? 0
  return (
    <SectionCard title="Financial health" description={`Formula ${health.formula_version}, based only on your Faldo data`}>
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
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--muted)" strokeWidth="8" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(ring / 100) * 326.7} 326.7`} className="transition-[stroke-dasharray] duration-1000" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="tabular text-4xl font-semibold tracking-[-0.03em]">{health.score}</span>
                <span className="text-xs text-muted-foreground">of 100</span>
              </div>
            </div>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">{health.label}</span>
          </div>
        )}
        <ul className={cn("grid gap-3 sm:grid-cols-2", health.score === null && "lg:col-span-2")}>
          {health.components.map((c) => (
            <li key={c.key} className={cn("space-y-2 rounded-lg border p-3", !c.counted && "bg-muted/40")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="tabular text-sm font-medium">{c.score !== null ? c.score : <span className="text-xs text-muted-foreground">Not counted</span>}</span>
              </div>
              {c.score !== null && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${c.score}%` }} /></div>}
              <p className="text-xs leading-relaxed text-muted-foreground">{c.explanation}</p>
              <p className="text-[0.6875rem] text-muted-foreground/80">Weight {Math.round((c.effective_weight ?? c.weight) * 100)}%. {c.measure}{c.value !== null && ` = ${c.value}`}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 flex gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{health.disclaimer}</p>
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
          <h2 className="section-title">Net worth trend</h2>
          <p className="text-[0.8125rem] text-muted-foreground">Wallet net worth across a range</p>
        </div>
        <Segmented label="Range" size="sm" value={range} onChange={setRange} options={[{ value: "30", label: "30D" }, { value: "90", label: "90D" }, { value: "365", label: "1Y" }]} />
      </div>
      <div className="mt-4 flex gap-8">
        <div><p className="text-xs text-muted-foreground">Current</p><Money minor={current} className={cn("mt-0.5 block text-xl font-semibold tracking-[-0.02em]", current < 0 && "text-expense")} /></div>
        <div><p className="text-xs text-muted-foreground">Change</p><Money minor={change} signed className={cn("mt-0.5 block text-xl font-semibold tracking-[-0.02em]", change >= 0 && "text-income")} /></div>
      </div>
      {history ? (
        <ResponsiveContainer width="100%" height={168}>
          <AreaChart data={history} margin={{ top: 14, left: 0, right: 0, bottom: 0 }}>
            <defs><linearGradient id="nw-trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.14} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="date" hide />
            <Tooltip formatter={(v) => formatMoney(Number(v))} labelFormatter={(d) => formatDate(String(d))}
              contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12, boxShadow: "var(--elevation-float)" }} />
            <Area dataKey="net_minor" name="Net worth" stroke="var(--primary)" strokeWidth={1.75} fill="url(#nw-trend)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <Skeleton className="mt-3 h-40" />}
    </section>
  )
}

function IncomeStatement({ report }: { report: MonthlyReport }) {
  const s = report.summary
  return (
    <section id="income-statement" className="card-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Income statement</h2>
          <p className="text-[0.8125rem] text-muted-foreground">{report.label}{report.is_partial && " (so far)"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          <Printer className="text-muted-foreground" /> Print or save PDF
        </Button>
      </div>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">Income</p>
          <ul className="mt-1 divide-y divide-border/60">
            {report.income_by_category.map((r) => <li key={r.label} className="flex justify-between py-1.5"><span>{r.label}</span><Money minor={r.amount_minor} /></li>)}
            {report.income_by_category.length === 0 && <li className="py-1.5 text-muted-foreground">No income recorded</li>}
          </ul>
          <p className="flex justify-between border-t border-foreground/15 pt-2 font-semibold"><span>Total income</span><Money minor={s.income_minor} /></p>
        </div>
        <div>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">Expenses</p>
          <ul className="mt-1 divide-y divide-border/60">
            {report.spending_by_category.map((r) => <li key={r.label} className="flex justify-between py-1.5"><span>{r.label}</span><Money minor={r.amount_minor} /></li>)}
          </ul>
          <p className="flex justify-between border-t border-foreground/15 pt-2 font-semibold"><span>Total expenses</span><Money minor={s.expense_minor} /></p>
        </div>
        <p className={cn("flex justify-between rounded-lg bg-muted/60 px-4 py-3 text-[0.9375rem] font-semibold", s.net_minor >= 0 ? "text-income" : "text-expense")}>
          <span>Net {s.net_minor >= 0 ? "savings" : "shortfall"}</span><Money minor={s.net_minor} signed />
        </p>
      </div>
    </section>
  )
}

export default function ReportsPage() {
  const [month, setMonth] = useState(monthKey())
  const { data: report, isLoading } = useReport(month)
  const { data: forecast } = useForecast("end_of_month")
  const summary = useQuery({ queryKey: ["report", "summary", month], queryFn: () => api.get<{ text: string; generated_by: string }>("/reports/summary", { month }) })
  const monthDate = parse(month, "yyyy-MM", new Date())
  const s = report?.summary
  const top = report?.spending_by_category[0]

  const switcher = (
    <div className="flex h-9 items-center rounded-lg border bg-card">
      <button type="button" className="flex size-9 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(monthDate, -1)))}><ChevronLeft className="size-4" /></button>
      <span className="tabular w-20 text-center text-[0.8125rem] font-medium">{format(monthDate, "MMM yyyy")}</span>
      <button type="button" className="flex size-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30" aria-label="Next month" disabled={month >= monthKey()} onClick={() => setMonth(monthKey(addMonths(monthDate, 1)))}><ChevronRight className="size-4" /></button>
    </div>
  )

  return (
    <div className="space-y-5">
      <LargeTitle title="Statistics" subtitle="Your financial patterns and trends" back={{ href: "/", label: "Home" }} actions={switcher} />

      {isLoading || !report || !s ? <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div></div> : s.transaction_count === 0 ? (
        <div className="card-surface"><EmptyState icon={BarChart3} title={`No activity in ${report.label}`} description="Statistics fill in as you record transactions." /></div>
      ) : (
        <div className="stagger space-y-4">
          <section className="card-surface p-4 sm:p-5">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">{report.label}{report.is_partial && " so far"}</p>
            {summary.data ? <p className="mt-1 max-w-[70ch] text-[0.9375rem] leading-relaxed">{summary.data.text}</p> : <div className="mt-2 space-y-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-3/4" /></div>}
          </section>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile icon={TrendingDown} tone="expense" label="Spent" value={<Money minor={s.expense_minor} />} footer={<Delta pct={s.expense_change_pct} goodWhen="down" suffix="" />} />
            <StatTile icon={TrendingUp} tone="income" label="Income" value={<Money minor={s.income_minor} />} footer={<Delta pct={s.income_change_pct} suffix="" />} />
            <StatTile icon={ArrowLeftRight} label="Net flow" value={<Money minor={s.net_minor} className={cn(s.net_minor < 0 && "text-expense")} />} footer={`Savings rate ${formatPct(s.savings_rate)}`} />
            <StatTile icon={Activity} tone="neutral" label="Transactions" value={s.transaction_count} footer={`About ${formatMoney(s.average_daily_spend_minor)} spent a day`} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="card-surface p-4 sm:p-5">
              <h2 className="section-title">Expense distribution</h2>
              <p className="text-[0.8125rem] text-muted-foreground">How your spending splits across categories</p>
              <div className="mt-4 flex items-center gap-5">
                <Donut size="size-32" stroke={12} data={report.spending_by_category.map((r) => ({ value: r.amount_minor, color: r.color }))}
                  center={top ? <><span className="tabular text-xl font-semibold">{Math.round(top.pct)}%</span><span className="max-w-20 truncate text-xs text-muted-foreground">{top.label}</span></> : null} />
                <ul className="min-w-0 flex-1 space-y-2">
                  {report.spending_by_category.slice(0, 6).map((r) => (
                    <li key={r.label} className="flex items-center gap-2 text-sm">
                      <span className="size-2 shrink-0 rounded-[3px]" style={{ backgroundColor: r.color }} />
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <Money minor={r.amount_minor} className="font-medium" />
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

          <Link href="/forecast" className="card-surface group block transition-colors hover:border-input">
            <div className="flex items-center gap-3 p-4 sm:px-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70"><LineChart className="size-5" strokeWidth={1.75} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="section-title">Cashflow forecast</h2>
                <p className="text-[0.8125rem] text-muted-foreground">Everything expected until month end, ordered by date</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </div>
            {forecast && (
              <div className="grid grid-cols-3 divide-x border-t py-3 [&>div]:px-4 sm:[&>div]:px-5">
                <div><p className="text-xs text-muted-foreground">Expected in</p><Money minor={forecast.expected_income_minor} className="mt-0.5 block text-[0.9375rem] font-semibold text-income" /></div>
                <div><p className="text-xs text-muted-foreground">Expected out</p><Money minor={forecast.scheduled_outflows_minor + forecast.projected_discretionary_minor} className="mt-0.5 block text-[0.9375rem] font-semibold" /></div>
                <div><p className="text-xs text-muted-foreground">Month end</p><Money minor={forecast.end_balance.p50} className="mt-0.5 block text-[0.9375rem] font-semibold" /></div>
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
                      {c.delta_minor > 0 ? <ArrowUpRight className="size-4 text-muted-foreground" /> : <ArrowDownRight className="size-4 text-income" />}
                      <span className="flex-1 truncate">{c.label}</span>
                      <span className={cn("tabular text-right font-medium", c.delta_minor < 0 && "text-income")}>{formatMoney(c.delta_minor, "PHP", { signed: true })}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
              <SectionCard title="Top merchants">
                <ol className="space-y-2.5">
                  {report.top_merchants.slice(0, 5).map((m, i) => (
                    <li key={m.merchant_id} className="flex items-center gap-3 text-sm">
                      <span className="tabular w-4 text-xs text-muted-foreground">{i + 1}</span>
                      <span className="flex-1 truncate">{m.name}</span>
                      <span className="tabular text-xs text-muted-foreground">{m.count}x</span>
                      <Money minor={m.amount_minor} className="w-24 text-right font-medium" />
                    </li>
                  ))}
                </ol>
              </SectionCard>
              {report.top_items.length > 0 && (
                <SectionCard title="Top purchase items">
                  <ol className="space-y-2.5">
                    {report.top_items.slice(0, 5).map((item, i) => (
                      <li key={item.name} className="flex items-center gap-3 text-sm">
                        <span className="tabular w-4 text-xs text-muted-foreground">{i + 1}</span>
                        <span className="flex-1 truncate">{item.name}</span>
                        <Money minor={item.amount_minor} className="w-24 text-right font-medium" />
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
