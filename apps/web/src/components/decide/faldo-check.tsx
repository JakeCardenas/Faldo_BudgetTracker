"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, CircleAlert, CircleCheck, CircleDashed, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { savePlanned } from "@/components/decide/planned"
import { AmountInput } from "@/components/finance/amount-input"
import { Money } from "@/components/finance/money"
import { IosSheet } from "@/components/ios/sheet"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, toMinor } from "@/lib/format"
import { useCategories } from "@/lib/queries"
import type { CheckResult } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface CheckPreset {
  amount_minor?: number
  label?: string
}

export function untilLabel(r: { period: string; next_income_on: string | null; next_income_label: string | null }) {
  return r.period === "until_income" && r.next_income_on
    ? `until ${r.next_income_label ?? "your next income"} on ${formatDate(r.next_income_on, "MMM d")}` : "over the next 30 days"
}

const VERDICTS = {
  fits: { icon: CircleCheck, tone: "text-income", surface: "bg-income-soft", title: () => "This fits." },
  stretch: { icon: CircleDashed, tone: "text-warning", surface: "bg-warning-soft", title: () => "It fits, but it's more than this week's share." },
  over: { icon: CircleAlert, tone: "text-expense", surface: "bg-danger-soft", title: (r: CheckResult) => `That's ${formatMoney(r.over_by_minor)} more than your Safe to Spend.` },
} as const

function BeforeAfter({ label, before, after, hint }: { label: string; before: number; after: number; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[0.9375rem]">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className="tabular shrink-0 text-[0.9375rem]">
        <span className="text-muted-foreground">{formatMoney(before)}</span>
        <ArrowRight className="mx-1.5 inline size-3.5 text-muted-foreground" aria-label="becomes" />
        <span className={cn("font-semibold", after < 0 && "text-expense")}>{formatMoney(after)}</span>
      </p>
    </div>
  )
}

/** A decision view: the verdict, Safe to Spend now and after, then what else moves. All figures come from the engine. */
export function CheckResultView({ result }: { result: CheckResult }) {
  const verdict = VERDICTS[result.verdict]
  const Icon = verdict.icon
  const until = untilLabel(result)
  const subtitle = result.verdict === "over"
    ? "It would come out of money set aside for bills, savings or your buffer."
    : `About ${formatMoney(result.per_day_after_minor)} a day ${until} after this.`
  const weekAfter = result.week_left_after_minor
  return (
    <div className="space-y-4" aria-live="polite">
      <div className={cn("flex gap-3 rounded-2xl p-4", verdict.surface)}>
        <Icon className={cn("mt-0.5 size-5 shrink-0", verdict.tone)} strokeWidth={2.2} />
        <div>
          <p className="text-[0.9375rem] font-semibold">{verdict.title(result)}</p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-foreground/75">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 rounded-2xl bg-muted/50 px-4 py-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Safe to spend now</p>
          <p className="tabular mt-1 truncate text-[1.375rem] font-semibold tracking-[-0.03em] text-muted-foreground">{formatMoney(result.safe_before_minor)}</p>
        </div>
        <ArrowRight className="mb-2 size-4 text-muted-foreground" aria-label="becomes" />
        <div className="min-w-0 text-right">
          <p className="text-xs text-muted-foreground">After this</p>
          <p className={cn("tabular mt-1 truncate text-[1.375rem] font-semibold tracking-[-0.03em]", result.raw_after_minor < 0 && "text-expense")}>{formatMoney(result.raw_after_minor)}</p>
        </div>
      </div>

      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-[inset_0_0_0_1px_var(--border)]">
        <BeforeAfter label="Left this week" before={result.week_left_before_minor} after={weekAfter}
          hint={weekAfter < 0 ? `${formatMoney(-weekAfter)} past this week's share` : undefined} />
        {result.plan_impact && (
          <BeforeAfter label={result.plan_impact.bucket === "joy" ? "Joy Money this week" : "Needs this week"}
            before={result.plan_impact.left_before_minor} after={result.plan_impact.left_after_minor}
            hint={result.plan_impact.left_after_minor < 0 ? "Past your money plan for this week" : "From your money plan"} />
        )}
        {result.budget_impact && (
          <BeforeAfter label={`${result.budget_impact.category} budget`} before={result.budget_impact.remaining_before_minor}
            after={result.budget_impact.remaining_after_minor} hint={result.budget_impact.would_exceed ? "Would go over budget" : "Left this month"} />
        )}
        {result.goal_impact && (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem]">{result.goal_impact.goal}</p>
              <p className="text-xs text-muted-foreground">If it came out of your savings. Estimate.</p>
            </div>
            <p className="tabular shrink-0 text-[0.9375rem] font-semibold text-warning">
              {result.goal_impact.delay_days ? `+${result.goal_impact.delay_days} ${result.goal_impact.delay_days === 1 ? "day" : "days"}` : "Slower"}
            </p>
          </div>
        )}
      </div>

      {result.commitments.length > 0 && (
        <div className="px-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[0.8125rem] font-medium">Already set aside {result.period === "until_income" && result.next_income_on ? `before ${formatDate(result.next_income_on, "MMM d")}` : "for the next 30 days"}</p>
            <Money minor={result.commitments_minor} className="text-[0.8125rem] text-muted-foreground" />
          </div>
          <ul className="mt-1.5 space-y-1">
            {result.commitments.slice(0, 4).map((c) => (
              <li key={`${c.ref_id}-${c.date}`} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                <span className="min-w-0 truncate text-muted-foreground">{c.label}, {c.is_overdue ? "overdue" : formatDate(c.date, "MMM d")}</span>
                <Money minor={c.amount_minor} className="text-muted-foreground" />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="px-1 text-xs text-muted-foreground">Calculated by Faldo from money you&apos;ve already received and what&apos;s planned. The decision is yours.</p>
    </div>
  )
}

export function useFaldoCheck() {
  return useMutation({
    mutationFn: (body: { amount_minor: number; label?: string | null; category_id?: string | null }) =>
      api.post<CheckResult>("/check", body),
  })
}

export function FaldoCheckSheet({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (open: boolean) => void; preset?: CheckPreset }) {
  return (
    <IosSheet open={open} onOpenChange={onOpenChange} title="Can I afford it?" description="See what a purchase does to your money before you buy." size="sm">
      {open && <CheckForm key={`${preset?.amount_minor ?? ""}-${preset?.label ?? ""}`} preset={preset} onDone={() => onOpenChange(false)} />}
    </IosSheet>
  )
}

function CheckForm({ preset, onDone }: { preset?: CheckPreset; onDone: () => void }) {
  const { openAddTransaction } = useAppActions()
  const { data: categories = [] } = useCategories()
  const [amount, setAmount] = useState(preset?.amount_minor ? String(preset.amount_minor / 100) : "")
  const [label, setLabel] = useState(preset?.label ?? "")
  const [categoryId, setCategoryId] = useState("none")
  const check = useFaldoCheck()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const minor = toMinor(amount)
  const expenseCategories = categories.filter((c) => c.kind === "expense" && !c.parent_id)

  function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (!minor) return
    check.mutate({ amount_minor: minor, label: label.trim() || null, category_id: categoryId === "none" ? null : categoryId })
  }

  if (check.data) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs text-muted-foreground">{check.data.label || "Purchase"}</p>
          <Money minor={check.data.amount_minor} className="text-2xl font-semibold tracking-[-0.02em]" />
        </div>
        <CheckResultView result={check.data} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => check.reset()}>Check something else</Button>
          {check.data.label && (
            <Button variant="outline" disabled={saving} onClick={async () => {
              setSaving(true)
              try {
                await savePlanned({ name: check.data.label!, amount_minor: check.data.amount_minor, category_id: categoryId === "none" ? null : categoryId })
                await qc.invalidateQueries({ queryKey: ["planned"] })
                toast.success("Saved to planned purchases in Plans")
                onDone()
              } catch (error) {
                toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
              } finally {
                setSaving(false)
              }
            }}>Save for later</Button>
          )}
          <Button variant="ghost" onClick={() => {
            onDone()
            openAddTransaction({ mode: "expense", preset: { amount_minor: check.data.amount_minor, note: check.data.label, category_id: categoryId === "none" ? null : categoryId } })
          }}>I bought it, log it</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={run} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="check-amount">How much?</Label>
        <AmountInput id="check-amount" size="lg" autoFocus value={amount} onValueChange={setAmount} placeholder="0" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="check-label">What is it? <span className="font-normal text-muted-foreground">Optional</span></Label>
          <Input id="check-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Headphones" />
        </div>
        <div className="space-y-1.5">
          <Label>Category <span className="font-normal text-muted-foreground">Optional</span></Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-full" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No budget check</SelectItem>
              {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {check.error && <p className="text-sm text-destructive">{check.error instanceof ApiError ? check.error.message : "Couldn't run the check."}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={!minor || check.isPending}>
        {check.isPending && <Loader2 className="animate-spin" />} Check it
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Want the long view? <Link href="/forecast" onClick={onDone} className="font-medium text-primary hover:opacity-80">Try a what-if</Link>
      </p>
    </form>
  )
}
