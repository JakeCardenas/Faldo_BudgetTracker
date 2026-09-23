"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { addMonths, format, parse } from "date-fns"
import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Info, Printer } from "lucide-react"
import { IncomeExpenseBars } from "@/components/charts/charts"
import { CategoryIcon } from "@/components/finance/category-icon"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { LargeTitle } from "@/components/ios/nav-header"
import { Section } from "@/components/ios/panel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatMoney, monthKey } from "@/lib/format"
import { useReport } from "@/lib/queries"
import type { Health, MonthlyReport } from "@/lib/types"
import { cn } from "@/lib/utils"

/** "Where did my money go?" Ranked categories; the bar length is relative to the biggest one. */
function WhereItWent({ report }: { report: MonthlyReport }) {
  const [all, setAll] = useState(false)
  const rows = report.spending_by_category
  const top = rows[0]?.amount_minor ?? 1
  const shown = all ? rows : rows.slice(0, 6)
  return (
    <Section title="Where it went">
      <ul className="ios-group divide-y divide-border/60">
        {shown.map((r) => (
          <li key={r.label}>
            <Link href={r.category_id ? `/transactions?category=${r.category_id}` : "/transactions"} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
              <CategoryIcon icon={r.icon} color={r.color} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[0.9375rem] font-medium">{r.label}</span>
                  <Money minor={r.amount_minor} className="text-[0.9375rem] font-semibold" />
                </span>
                <span className="mt-1.5 flex items-center gap-2.5">
                  <span className="h-1.5 rounded-full" style={{ width: `${Math.max(3, (r.amount_minor / top) * 100)}%`, backgroundColor: r.color }} aria-hidden />
                  <span className="tabular shrink-0 text-xs text-muted-foreground">{Math.round(r.pct)}%</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
          {all ? "Show fewer" : `Show all ${rows.length}`} <ChevronDown className={cn("size-3.5 transition-transform", all && "rotate-180")} />
        </button>
      )}
    </Section>
  )
}

/** "Am I spending more than usual?" Category changes against the same days of last month. */
function MoreThanUsual({ report }: { report: MonthlyReport }) {
  const changes = report.category_changes.filter((c) => c.delta_minor !== 0).slice(0, 5)
  return (
    <Section title="Compared with last month" description="Same days of the month, so it's a fair comparison">
      {changes.length === 0 ? (
        <p className="card-surface px-4 py-5 text-sm text-muted-foreground">Not enough to compare yet.</p>
      ) : (
        <ul className="ios-group divide-y divide-border/60">
          {changes.map((c) => {
            const more = c.delta_minor > 0
            return (
              <li key={c.key} className="flex items-center gap-3 px-4 py-3">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", more ? "bg-warning-soft text-warning" : "bg-income-soft text-income")}>
                  {more ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem]">{c.label}</span>
                  <span className="tabular block text-xs text-muted-foreground">{formatMoney(c.current_minor)} vs {formatMoney(c.previous_minor)}</span>
                </span>
                <span className={cn("tabular text-[0.9375rem] font-semibold", more ? "text-foreground" : "text-income")}>
                  {more ? `${formatMoney(c.delta_minor)} more` : `${formatMoney(-c.delta_minor)} less`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

function TopMerchants({ report }: { report: MonthlyReport }) {
  if (report.top_merchants.length === 0) return null
  return (
    <Section title="Where you spend most often">
      <ol className="ios-group divide-y divide-border/60">
        {report.top_merchants.slice(0, 5).map((m, i) => (
          <li key={m.merchant_id} className="flex items-center gap-3 px-4 py-3 text-[0.9375rem]">
            <span className="tabular w-4 text-center text-sm text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <span className="tabular text-xs text-muted-foreground">{m.count} {m.count === 1 ? "time" : "times"}</span>
            <Money minor={m.amount_minor} className="w-24 text-right font-semibold" />
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Disclosure({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <details id={id} className="group card-surface overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">{title}</span>
          {description && <span className="block text-[0.8125rem] text-muted-foreground">{description}</span>}
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-4 py-4 sm:px-5">{children}</div>
    </details>
  )
}

function IncomeStatement({ report }: { report: MonthlyReport }) {
  const s = report.summary
  return (
    <div id="income-statement" className="space-y-4 text-sm">
      <div className="flex justify-end print:hidden">
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer /> Print or save PDF</Button>
      </div>
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
      <p className={cn("flex justify-between rounded-xl bg-muted/60 px-4 py-3 text-[0.9375rem] font-semibold", s.net_minor >= 0 ? "text-income" : "text-expense")}>
        <span>Net {s.net_minor >= 0 ? "savings" : "shortfall"}</span><Money minor={s.net_minor} signed />
      </p>
    </div>
  )
}

function HealthDetails({ health }: { health: Health }) {
  return (
    <div className="space-y-4">
      {health.score === null ? (
        <p className="text-sm text-muted-foreground">Not enough data yet. The score needs about 60 days of history and at least three measurable factors ({health.history_days} days so far).</p>
      ) : (
        <p className="flex items-baseline gap-2"><span className="tabular text-4xl font-semibold tracking-[-0.03em]">{health.score}</span><span className="text-sm text-muted-foreground">of 100{health.label ? `, ${health.label.toLowerCase()}` : ""}</span></p>
      )}
      <ul className="divide-y divide-border/60">
        {health.components.map((c) => (
          <li key={c.key} className="py-3 first:pt-0">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{c.label}</span>
              <span className="tabular">{c.score !== null ? c.score : <span className="text-xs text-muted-foreground">Not counted</span>}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.explanation}</p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground/80">Weight {Math.round((c.effective_weight ?? c.weight) * 100)}%. {c.measure}{c.value !== null && ` = ${c.value}`}</p>
          </li>
        ))}
      </ul>
      <p className="flex gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{health.disclaimer}</p>
    </div>
  )
}

/** Past money, explained. Each block answers one question; nothing is here just because finance apps have charts. */
export default function ReportsPage() {
  const [month, setMonth] = useState(monthKey())
  const { data: report, isLoading } = useReport(month)
  const summary = useQuery({ queryKey: ["report", "summary", month], queryFn: () => api.get<{ text: string; generated_by: string }>("/reports/summary", { month }) })
  const monthDate = parse(month, "yyyy-MM", new Date())
  const s = report?.summary
  const prevLabel = format(addMonths(monthDate, -1), "MMMM")
  const diff = s ? s.expense_minor - s.previous_expense_minor : 0

  const switcher = (
    <div className="flex h-9 items-center rounded-full bg-card shadow-[inset_0_0_0_1px_var(--border)]">
      <button type="button" className="hit flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(monthDate, -1)))}><ChevronLeft className="size-4" /></button>
      <span className="tabular w-20 text-center text-[0.8125rem] font-medium">{format(monthDate, "MMM yyyy")}</span>
      <button type="button" className="hit flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30" aria-label="Next month" disabled={month >= monthKey()} onClick={() => setMonth(monthKey(addMonths(monthDate, 1)))}><ChevronRight className="size-4" /></button>
    </div>
  )

  return (
    <div className="space-y-6">
      <LargeTitle title="Statistics" back={{ href: "/transactions", label: "History" }} actions={switcher} />

      {isLoading || !report || !s ? (
        <div className="space-y-6"><div className="space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-11 w-52" /><Skeleton className="h-4 w-64" /></div><Skeleton className="h-72 rounded-2xl" /></div>
      ) : s.transaction_count === 0 ? (
        <div className="card-surface"><EmptyState icon={BarChart3} title={`No activity in ${report.label}`} description="Statistics fill in as you record transactions." /></div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
          <div className="space-y-8">
            <section aria-label="Month summary" className="">
              <p className="text-[0.9375rem] text-muted-foreground">Spent in {report.label}{report.is_partial && " so far"}</p>
              <Money minor={s.expense_minor} className="display-xl mt-1.5 block" />
              <p className="mt-2 text-sm text-muted-foreground">
                {s.previous_expense_minor > 0 && diff !== 0 && (
                  <><span className={cn("tabular font-medium", diff > 0 ? "text-foreground" : "text-income")}>{formatMoney(Math.abs(diff))} {diff > 0 ? "more" : "less"}</span> than {prevLabel} at this point. </>
                )}
                <span className="tabular">{formatMoney(s.income_minor)}</span> came in.
              </p>
              {summary.data ? <p className="mt-4 max-w-[62ch] text-[0.9375rem] leading-relaxed text-foreground/85">{summary.data.text}</p> : <div className="mt-4 space-y-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-3/4" /></div>}
            </section>
            <WhereItWent report={report} />
            <Section title="Money in and out" description="Last 12 months">
              <div className="card-surface p-4 sm:p-5">
                <IncomeExpenseBars data={report.history} height={220} />
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-3" /> Money in</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-1" /> Money out</span>
                </div>
              </div>
            </Section>
          </div>
          <div className="space-y-8">
            <MoreThanUsual report={report} />
            <TopMerchants report={report} />
            <div className="space-y-3">
              <Disclosure title="Income statement" description={`${report.label}${report.is_partial ? " so far" : ""}, printable`}><IncomeStatement report={report} /></Disclosure>
              <Disclosure title="Financial health" description="A transparent score from your Faldo data"><HealthDetails health={report.health} /></Disclosure>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
