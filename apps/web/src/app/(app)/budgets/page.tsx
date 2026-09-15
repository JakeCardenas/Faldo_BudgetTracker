"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { addMonths, format, parse } from "date-fns"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChevronLeft, ChevronRight, Copy, PiggyBank, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { CategoryIcon } from "@/components/finance/category-icon"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { ProgressBar, STATUS_LABEL } from "@/components/finance/progress-bar"
import { PageHeader, SectionCard } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Budget for {format(parse(budget.month, "yyyy-MM", new Date()), "MMMM yyyy")}</DialogTitle>
          <DialogDescription>Set monthly limits. Leave blank for categories you don't want to budget.</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-1 overflow-y-auto px-6">
          {expense.map((c) => {
            const line = budget.lines.find((l) => l.category_id === c.id)
            return (
              <div key={c.id} className="flex items-center gap-3 py-1.5">
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
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">Total <span className="tabular font-medium text-foreground">{formatMoney(total)}</span></p>
          <div className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save budget"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
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

  return (
    <div className="space-y-5">
      <PageHeader title="Budgets" description="Monthly limits by category, with pacing and history."
        actions={<>
          <div className="flex items-center rounded-lg border bg-card">
            <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(monthDate, -1)))}><ChevronLeft /></Button>
            <span className="tabular w-28 text-center text-sm font-medium">{format(monthDate, "MMM yyyy")}</span>
            <Button variant="ghost" size="icon" aria-label="Next month" disabled={isFuture} onClick={() => setMonth(monthKey(addMonths(monthDate, 1)))}><ChevronRight /></Button>
          </div>
          {budget && budget.lines.length > 0 && <Button onClick={() => setEditing(true)}>Edit budget</Button>}
        </>} />

      {isLoading || !budget ? <Skeleton className="h-96 rounded-xl" /> : budget.lines.length === 0 ? (
        <div className="card-surface">
          <EmptyState icon={PiggyBank} title={`No budget for ${format(monthDate, "MMMM")}`} description="Budgets help Faldo warn you before you overspend and explain what changed."
            action={<div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setEditing(true)}><Plus /> Create budget</Button>
              <Button variant="outline" onClick={copyPrevious}><Copy /> Copy previous month</Button>
            </div>} />
        </div>
      ) : (
        <div className="stagger space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="card-surface space-y-4 p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Spent in budgeted categories</p>
                  <p className="text-3xl font-semibold tracking-[-0.025em]"><Money minor={budget.total_spent_minor} /> <span className="text-lg font-normal text-muted-foreground">/ {formatMoney(budget.total_budgeted_minor)}</span></p>
                </div>
                <p className={cn("text-sm font-medium", budget.total_budgeted_minor - budget.total_spent_minor < 0 ? "text-destructive" : "text-primary")}>
                  {budget.total_budgeted_minor - budget.total_spent_minor >= 0 ? `${formatMoney(budget.total_budgeted_minor - budget.total_spent_minor)} remaining` : `${formatMoney(budget.total_spent_minor - budget.total_budgeted_minor)} over`}
                </p>
              </div>
              <ProgressBar value={pct} status={pct > 100 ? "over" : pct > 85 ? "near_limit" : "on_track"} marker={lines[0]?.pct_month_elapsed} label={`Total budget ${Math.round(pct)}% used`} className="h-2.5" />
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>{formatPct(lines[0]?.pct_month_elapsed ?? 0)} of month elapsed</span>
                <span>Unbudgeted spending {formatMoney(budget.unbudgeted_spent_minor)}</span>
                {atRisk.length > 0 && <span className="text-warning">{atRisk.length} {atRisk.length === 1 ? "category needs" : "categories need"} attention</span>}
              </div>
            </div>
            <SectionCard title="Budget vs spending" description="Last 6 months" bodyClassName="pt-2">
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={budget.history} margin={{ left: -8, right: 0, top: 4 }} barGap={3}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => formatMoney(v, "PHP", { compact: true })} width={52} />
                  <Tooltip formatter={(v, n) => [formatMoney(Number(v)), n === "budgeted_minor" ? "Budgeted" : "Spent"]} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} cursor={{ fill: "var(--muted)" }} />
                  <Bar dataKey="budgeted_minor" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="spent_minor" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          {atRisk.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-warning/20 bg-warning-soft/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm"><span className="font-medium">{atRisk[0].category_name}</span> is {atRisk[0].status === "over" ? "over budget" : "on pace to go over"}. Want to know why?</p>
              <Button asChild variant="outline" size="sm" className="bg-card">
                <Link href={`/assistant?q=${encodeURIComponent(`Why is my ${atRisk[0].category_name} budget ${atRisk[0].status === "over" ? "over" : "at risk"} this month?`)}`}><Sparkles /> Explain with AI</Link>
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lines.map((line) => {
              const vsLast = line.previous_spent_minor ? ((line.spent_minor - line.previous_spent_minor) / line.previous_spent_minor) * 100 : null
              return (
                <div key={line.id} className="card-surface space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <CategoryIcon icon={line.category_icon} color={line.category_color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{line.category_name}</p>
                      <p className={cn("text-xs", line.status === "over" ? "text-destructive" : line.status === "at_risk" ? "text-warning" : "text-muted-foreground")}>{STATUS_LABEL[line.status]}</p>
                    </div>
                    <span className="tabular text-sm font-medium">{formatPct(line.pct_used)}</span>
                  </div>
                  <p className="text-sm"><Money minor={line.spent_minor} className="font-semibold" /> <span className="text-muted-foreground">/ {formatMoney(line.limit_minor)}</span></p>
                  <ProgressBar value={line.pct_used} status={line.status} marker={line.pct_month_elapsed} label={`${line.category_name} ${line.pct_used}% used`} />
                  <div className="grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                    <div><p className="text-muted-foreground">{line.remaining_minor >= 0 ? "Remaining" : "Over"}</p><p className="tabular font-medium">{formatMoney(Math.abs(line.remaining_minor))}</p></div>
                    <div><p className="text-muted-foreground">Projected</p><p className="tabular font-medium">{formatMoney(line.projected_minor)}</p></div>
                    <div><p className="text-muted-foreground">Last month</p><p className="tabular font-medium">{formatMoney(line.previous_spent_minor)}{vsLast !== null && <span className={cn("ml-1", vsLast > 0 ? "text-warning" : "text-primary")}>{formatPct(vsLast, true)}</span>}</p></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {editing && budget && <EditBudgetDialog budget={budget} open={editing} onOpenChange={setEditing} />}
    </div>
  )
}
