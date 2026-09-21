"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { addMonths, format, parse } from "date-fns"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { Panda } from "@/components/brand/panda"
import { AmountInput } from "@/components/finance/amount-input"
import { CategoryIcon } from "@/components/finance/category-icon"
import { Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { IosSheet } from "@/components/ios/sheet"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatMoney, formatPct, minorToInput, monthKey, toMinor } from "@/lib/format"
import { invalidateFinancialData, useBudget, useCategories } from "@/lib/queries"
import type { Budget } from "@/lib/types"
import { cn } from "@/lib/utils"

function EditBudgetDialog({ budget, open, onOpenChange }: { budget: Budget; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: categories = [] } = useCategories()
  const expense = categories.filter((c) => c.kind === "expense" && !c.parent_id)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(budget.lines.map((l) => [l.category_id, minorToInput(l.limit_minor)])))
  const [busy, setBusy] = useState(false)
  const total = Object.values(values).reduce((s, v) => s + (toMinor(v) ?? 0), 0)

  async function save() {
    setBusy(true)
    try {
      const lines = Object.entries(values).map(([category_id, v]) => ({ category_id, limit_minor: toMinor(v) ?? 0 })).filter((l) => l.limit_minor > 0)
      await api.put("/budgets", { month: budget.month, lines })
      await invalidateFinancialData(qc)
      toast.success("Budget saved")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save the budget.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <IosSheet open={open} onOpenChange={onOpenChange} title={`Budget for ${format(parse(budget.month, "yyyy-MM", new Date()), "MMMM")}`}
      description="Set a monthly limit for the categories you want to watch. Leave the rest blank."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Total <span className="tabular font-semibold text-foreground">{formatMoney(total)}</span></p>
          <Button size="lg" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save budget"}</Button>
        </div>
      }>
        <div className="space-y-1">
          {expense.map((c) => {
            const line = budget.lines.find((l) => l.category_id === c.id)
            return (
              <div key={c.id} className="flex items-center gap-3 py-2">
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {line && <p className="text-xs text-muted-foreground">Avg last 3 months {formatMoney(line.average_spent_minor)}</p>}
                </div>
                <AmountInput aria-label={`${c.name} limit`} value={values[c.id] ?? ""} onValueChange={(v) => setValues({ ...values, [c.id]: v })} placeholder="No limit" className="w-32" />
              </div>
            )
          })}
        </div>
    </IosSheet>
  )
}

export default function BudgetsPage() {
  const qc = useQueryClient()
  const [month, setMonth] = useState(monthKey())
  const [editing, setEditing] = useState(false)
  const { data: budget, isLoading } = useBudget(month)
  const monthDate = parse(month, "yyyy-MM", new Date())
  const isFuture = month > monthKey()
  const lines = useMemo(() => [...(budget?.lines ?? [])].sort((a, b) => b.pct_used - a.pct_used), [budget])

  async function copyPrevious() {
    try {
      await api.post("/budgets/copy-previous", undefined, { month })
      await invalidateFinancialData(qc)
      toast.success("Copied your previous budget")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't copy.")
    }
  }

  const pct = budget && budget.total_budgeted_minor ? (budget.total_spent_minor / budget.total_budgeted_minor) * 100 : 0
  const atRisk = lines.filter((l) => l.status === "over" || l.status === "at_risk")

  const left = budget ? budget.total_budgeted_minor - budget.total_spent_minor : 0
  const elapsed = lines[0]?.pct_month_elapsed ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title="Budgets" description="How you intend to spend this month."
        actions={<>
          <div className="flex h-9 items-center rounded-full bg-card shadow-[inset_0_0_0_1px_var(--border)]">
            <button type="button" className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(monthDate, -1)))}><ChevronLeft className="size-4" /></button>
            <span className="tabular w-24 text-center text-[0.8125rem] font-medium">{format(monthDate, "MMM yyyy")}</span>
            <button type="button" className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30" aria-label="Next month" disabled={isFuture} onClick={() => setMonth(monthKey(addMonths(monthDate, 1)))}><ChevronRight className="size-4" /></button>
          </div>
          {budget && budget.lines.length > 0 && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
        </>} />

      {isLoading || !budget ? <Skeleton className="h-96 rounded-2xl" /> : budget.lines.length === 0 ? (
        <section className="card-surface flex flex-col items-center px-6 py-10 text-center">
          <Panda pose="munch" sizes="128px" className="w-28" />
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em]">No budget for {format(monthDate, "MMMM")} yet</h2>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">Pick a few categories to watch, like food and transport. Faldo warns you before you go over.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={() => setEditing(true)}><Plus /> Create a budget</Button>
            <Button variant="secondary" onClick={copyPrevious}><Copy /> Copy last month</Button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
          <div className="space-y-6">
            <section aria-label="This month" className="px-1">
              <p className="text-[0.9375rem] text-muted-foreground">{format(monthDate, "MMMM")} budget</p>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <Money minor={budget.total_spent_minor} className="display-xl" />
                <span className="tabular text-lg text-muted-foreground">of {formatMoney(budget.total_budgeted_minor)}</span>
              </p>
              <p className={cn("mt-2 text-sm font-medium", left < 0 ? "text-expense" : "text-income")}>
                {left >= 0 ? `${formatMoney(left)} left to spend` : `${formatMoney(-left)} over your budget`}
              </p>
              <ProgressBar value={pct} status={pct > 100 ? "over" : pct > 85 ? "near_limit" : "on_track"} marker={elapsed} label={`Total budget ${Math.round(pct)}% used`} className="mt-4 h-2.5" />
              <p className="mt-2 text-xs text-muted-foreground">The mark shows how much of the month has passed ({formatPct(elapsed)}).</p>
            </section>

            {atRisk.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3">
                <p className="min-w-0 flex-1 text-sm"><span className="font-semibold">{atRisk[0].category_name}</span> is {atRisk[0].status === "over" ? "over budget" : "on pace to go over"}.</p>
                <Button asChild variant="secondary" size="sm" className="bg-card">
                  <Link href={`/assistant?q=${encodeURIComponent(`Why is my ${atRisk[0].category_name} budget ${atRisk[0].status === "over" ? "over" : "at risk"} this month?`)}`}>Ask Faldo why</Link>
                </Button>
              </div>
            )}

            <ul className="ios-group divide-y divide-border/60">
              {lines.map((line) => {
                const over = line.remaining_minor < 0
                const willGoOver = !over && line.projected_minor > line.limit_minor
                return (
                  <li key={line.id} className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <CategoryIcon icon={line.category_icon} color={line.category_color} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate text-[0.9375rem] font-medium">{line.category_name}</p>
                          <p className="tabular shrink-0 text-[0.9375rem]"><span className="font-semibold">{formatMoney(line.spent_minor)}</span> <span className="text-muted-foreground">/ {formatMoney(line.limit_minor)}</span></p>
                        </div>
                        <ProgressBar className="mt-2" value={line.pct_used} status={line.status} marker={line.pct_month_elapsed} label={`${line.category_name} ${Math.round(line.pct_used)}% used`} />
                        <p className={cn("mt-1.5 text-xs", over ? "font-medium text-expense" : willGoOver ? "text-warning" : "text-muted-foreground")}>
                          {over ? `${formatMoney(-line.remaining_minor)} over` : willGoOver ? `${formatMoney(line.remaining_minor)} left, on pace for ${formatMoney(line.projected_minor)}` : `${formatMoney(line.remaining_minor)} left`}
                        </p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="space-y-4">
            <div className="card-surface flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
              <span className="text-muted-foreground">Spent outside your budget</span>
              <Money minor={budget.unbudgeted_spent_minor} className="font-semibold" />
            </div>
            <details className="group card-surface overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold">Last 6 months</span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t px-3 pt-3 pb-2">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={budget.history} margin={{ left: -8, right: 0, top: 4 }} barGap={3}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => formatMoney(v, "PHP", { compact: true })} width={52} />
                    <Tooltip formatter={(v, n) => [formatMoney(Number(v)), n === "budgeted_minor" ? "Budgeted" : "Spent"]} contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", fontSize: 12 }} cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="budgeted_minor" fill="var(--chart-3)" radius={[6, 6, 2, 2]} maxBarSize={16} />
                    <Bar dataKey="spent_minor" fill="var(--chart-1)" radius={[6, 6, 2, 2]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 px-1 pt-1 pb-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-3" /> Budgeted</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-1" /> Spent</span>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
      {editing && budget && <EditBudgetDialog budget={budget} open={editing} onOpenChange={setEditing} />}
    </div>
  )
}
