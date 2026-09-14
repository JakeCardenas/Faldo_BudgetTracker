"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { addMonths, format, parse } from "date-fns"
import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, HeartPulse, Info, Sparkles } from "lucide-react"
import { DailyBars, IncomeExpenseBars, SpendingDonut } from "@/components/charts/charts"
import { CategoryIcon } from "@/components/finance/category-icon"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { Delta } from "@/components/finance/stat"
import { PageHeader, SectionCard } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatMoney, formatPct, monthKey } from "@/lib/format"
import { useReport } from "@/lib/queries"
import type { Health } from "@/lib/types"
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
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
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

export default function ReportsPage() {
  const [month, setMonth] = useState(monthKey())
  const { data: report, isLoading } = useReport(month)
  const summary = useQuery({ queryKey: ["report", "summary", month], queryFn: () => api.get<{ text: string; generated_by: string }>("/reports/summary", { month }) })
  const monthDate = parse(month, "yyyy-MM", new Date())
  const s = report?.summary

  return (
    <div className="space-y-5 pt-2">
      <PageHeader title="Reports" description="Monthly overview, category trends, savings rate and where your money went."
        actions={<div className="flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(monthDate, -1)))}><ChevronLeft /></Button>
          <span className="w-28 text-center text-sm font-medium">{format(monthDate, "MMM yyyy")}</span>
          <Button variant="ghost" size="icon" aria-label="Next month" disabled={month >= monthKey()} onClick={() => setMonth(monthKey(addMonths(monthDate, 1)))}><ChevronRight /></Button>
        </div>} />

      {isLoading || !report || !s ? <div className="space-y-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div> : s.transaction_count === 0 ? (
        <div className="card-surface"><EmptyState icon={BarChart3} title={`No activity in ${report.label}`} description="Reports fill in as you record transactions." /></div>
      ) : (
        <div className="stagger space-y-4">
          <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-mint/60 to-card p-5">
            <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-primary uppercase"><Sparkles className="size-3.5" /> {report.label}{report.is_partial && " so far"} · summary</p>
            {summary.data ? <p className="mt-2 leading-relaxed">{summary.data.text}</p> : <div className="mt-3 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>}
            <p className="mt-2 text-xs text-muted-foreground">Written from the figures on this page. No numbers are estimated.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card-surface space-y-2 p-5"><p className="text-sm text-muted-foreground">Income</p><Money minor={s.income_minor} className="text-2xl font-semibold tracking-tight" /><Delta pct={s.income_change_pct} suffix="vs prior period" /></div>
            <div className="card-surface space-y-2 p-5"><p className="text-sm text-muted-foreground">Expenses</p><Money minor={s.expense_minor} className="text-2xl font-semibold tracking-tight" /><Delta pct={s.expense_change_pct} goodWhen="down" suffix="vs prior period" /></div>
            <div className="card-surface space-y-2 p-5"><p className="text-sm text-muted-foreground">Net saved</p><Money minor={s.net_minor} className={cn("text-2xl font-semibold tracking-tight", s.net_minor < 0 && "text-destructive")} /><p className="text-xs text-muted-foreground">Prior period {formatMoney(s.previous_net_minor)}</p></div>
            <div className="card-surface space-y-2 p-5"><p className="text-sm text-muted-foreground">Savings rate</p><p className="text-2xl font-semibold tracking-tight">{formatPct(s.savings_rate)}</p><p className="text-xs text-muted-foreground">Prior {formatPct(s.previous_savings_rate)} · avg {formatMoney(s.average_daily_spend_minor)}/day spent</p></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Income vs expenses" description="Last 12 months"><IncomeExpenseBars data={report.history} /></SectionCard>
            <SectionCard title="Spending by category">
              <div className="grid items-center gap-5 sm:grid-cols-[11rem_1fr]">
                <SpendingDonut rows={report.spending_by_category} total={s.expense_minor} />
                <ul className="space-y-2">
                  {report.spending_by_category.slice(0, 7).map((r) => (
                    <li key={r.label} className="flex items-center gap-2.5 text-sm">
                      <CategoryIcon icon={r.icon} color={r.color} size="sm" />
                      <span className="flex-1 truncate">{r.label}</span>
                      <span className="tabular text-xs text-muted-foreground">{formatPct(r.pct)}</span>
                      <Money minor={r.amount_minor} className="w-20 text-right font-medium" />
                    </li>
                  ))}
                </ul>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <SectionCard title="Daily spending"><DailyBars data={report.daily_spending} /></SectionCard>
            <SectionCard title="Biggest changes" description="Compared with the same days of the prior month">
              <ul className="space-y-2.5">
                {report.category_changes.length === 0 && <li className="text-sm text-muted-foreground">No changes to compare.</li>}
                {report.category_changes.slice(0, 6).map((c) => (
                  <li key={c.key} className="flex items-center gap-2 text-sm">
                    {c.delta_minor > 0 ? <ArrowUpRight className="size-4 text-warning" /> : <ArrowDownRight className="size-4 text-primary" />}
                    <span className="flex-1 truncate">{c.label}</span>
                    <span className="tabular text-xs text-muted-foreground">{formatMoney(c.previous_minor)} → {formatMoney(c.current_minor)}</span>
                    <span className={cn("tabular w-20 text-right font-medium", c.delta_minor > 0 ? "text-warning" : "text-primary")}>{formatMoney(c.delta_minor, "PHP", { signed: true })}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Top merchants">
              <ol className="space-y-2.5">
                {report.top_merchants.map((m, i) => (
                  <li key={m.merchant_id} className="flex items-center gap-3 text-sm">
                    <span className="tabular w-5 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.count}×</span>
                    <Money minor={m.amount_minor} className="w-24 text-right" />
                  </li>
                ))}
              </ol>
            </SectionCard>
            <SectionCard title="Top purchase items">
              {report.top_items.length === 0 ? <p className="text-sm text-muted-foreground">Add items to transactions or scan receipts to see item-level spending.</p> : (
                <ol className="space-y-2.5">
                  {report.top_items.map((item, i) => (
                    <li key={item.name} className="flex items-center gap-3 text-sm">
                      <span className="tabular w-5 text-xs text-muted-foreground">{i + 1}</span>
                      <span className="flex-1 truncate font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.count}×</span>
                      <Money minor={item.amount_minor} className="w-24 text-right" />
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          </div>

          <HealthPanel health={report.health} />
        </div>
      )}
    </div>
  )
}
