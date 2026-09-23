"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeftRight, ArrowUp, ChevronLeft, ChevronRight, FileUp, Minus, PiggyBank, Plus, Scale, ScanLine, ShoppingBag, type LucideIcon } from "lucide-react"
import { MoneyOwedIcon } from "@/components/finance/category-icon"
import { AddPlannedSheet } from "@/components/decide/planned"
import { IosSheet } from "@/components/ios/sheet"
import { useAppActions } from "@/components/layout/app-context"
import { api } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { GoalIcon } from "@/lib/goal-icons"
import { play } from "@/lib/sound"
import type { Goal } from "@/lib/types"
import { cn } from "@/lib/utils"

const PRIMARY: { mode: "expense" | "income" | "transfer"; label: string; icon: LucideIcon; tint: string }[] = [
  { mode: "expense", label: "Expense", icon: Minus, tint: "bg-expense-soft text-expense" },
  { mode: "income", label: "Income", icon: Plus, tint: "bg-income-soft text-income" },
  { mode: "transfer", label: "Transfer", icon: ArrowLeftRight, tint: "bg-muted text-foreground/80" },
]

function Row({ icon: Icon, title, subtitle, onClick }: { icon: LucideIcon; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={() => { play("tap"); onClick() }}
      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/70 active:bg-accent">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/75"><Icon className="size-[1.05rem]" strokeWidth={2} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">{title}</span>
        <span className="block truncate text-[0.8125rem] text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
    </button>
  )
}

/** The + menu. Typing is the fastest path; the three tiles cover everyday money in and out. */
export function AddMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { openAddTransaction, openCheck } = useAppActions()
  const [text, setText] = useState("")
  const [step, setStep] = useState<"main" | "goal">("main")
  const [planning, setPlanning] = useState(false)
  const goals = useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal[]>("/goals"), enabled: open && step === "goal" })
  const active = (goals.data ?? []).filter((g) => g.status === "active")

  /** Close this sheet first so two dialogs never fight over focus. */
  function then(action: () => void) {
    onOpenChange(false)
    setTimeout(action, 80)
  }

  function change(next: boolean) {
    if (!next) setTimeout(() => { setStep("main"); setText("") }, 200)
    onOpenChange(next)
  }

  return (
    <>
      <IosSheet open={open} onOpenChange={change} title={step === "goal" ? "Add to a goal" : "Add"} size="sm"
        description={step === "goal" ? "Pick the goal this money goes to." : undefined}>
        {step === "main" ? (
          <div className="space-y-5">
            <form onSubmit={(e) => { e.preventDefault(); const value = text.trim(); if (value) then(() => openAddTransaction({ mode: "describe", text: value })) }}>
              <label htmlFor="add-text" className="sr-only">Describe what you spent or received</label>
              <div className="flex items-center gap-2 rounded-2xl bg-muted py-1.5 pr-1.5 pl-4 transition-shadow focus-within:ring-3 focus-within:ring-ring/25">
                <input id="add-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoComplete="off"
                  placeholder="₱180 Jollibee lunch via GCash"
                  className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/75 sm:text-[0.9375rem]" />
                <button type="submit" disabled={!text.trim()} aria-label="Read it"
                  className="pressable hit flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-35">
                  <ArrowUp className="size-4.5" strokeWidth={2.3} />
                </button>
              </div>
              <p className="mt-2 px-1 text-[0.8125rem] text-muted-foreground">Type it like a text, in English or Taglish. You check it before anything is saved.</p>
            </form>

            <div className="grid grid-cols-3 gap-2.5">
              {PRIMARY.map(({ mode, label, icon: Icon, tint }) => (
                <button key={mode} type="button" onClick={() => { play("tap"); then(() => openAddTransaction({ mode })) }}
                  className="pressable flex h-[5.75rem] flex-col items-start justify-between rounded-2xl bg-muted/70 p-3 text-left transition-colors hover:bg-muted">
                  <span className={cn("flex size-9 items-center justify-center rounded-full", tint)}><Icon className="size-[1.1rem]" strokeWidth={2.1} /></span>
                  <span className="text-[0.9375rem] font-medium">{label}</span>
                </button>
              ))}
            </div>

            <div className="-mx-1 overflow-hidden rounded-2xl bg-muted/40 dark:bg-muted/50">
              <Row icon={ScanLine} title="Scan a receipt" subtitle="Faldo reads the items and total" onClick={() => then(() => openAddTransaction({ mode: "receipt" }))} />
              <Row icon={PiggyBank} title="Add to a goal" subtitle="Put money toward something you're saving for" onClick={() => setStep("goal")} />
              <Row icon={MoneyOwedIcon} title="Money owed" subtitle="Utang, loans and split bills" onClick={() => then(() => router.push("/debts?new=1"))} />
              <Row icon={ShoppingBag} title="Plan a purchase" subtitle="Faldo tells you when it fits" onClick={() => then(() => setPlanning(true))} />
              <Row icon={Scale} title="Check a purchase" subtitle="See what it does to Safe to Spend first" onClick={() => then(() => openCheck())} />
              <Row icon={FileUp} title="Import a statement" subtitle="Bring in a bank or e-wallet CSV" onClick={() => then(() => router.push("/import"))} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => setStep("main")} className="-ml-1 inline-flex items-center gap-0.5 rounded-full py-1 pr-2 text-sm font-medium text-primary">
              <ChevronLeft className="size-4" /> Back
            </button>
            {goals.isLoading ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />)}</div>
            ) : active.length === 0 ? (
              <div className="rounded-2xl bg-muted/50 px-4 py-6 text-center">
                <p className="text-[0.9375rem] font-medium">No goals yet</p>
                <p className="mt-1 text-[0.8125rem] text-muted-foreground">Start one and every peso you add counts toward it.</p>
                <button type="button" onClick={() => then(() => router.push("/goals?new=1"))} className="mt-3 text-sm font-medium text-primary">Create a goal</button>
              </div>
            ) : (
              <ul className="-mx-1 overflow-hidden rounded-2xl bg-muted/40 dark:bg-muted/50">
                {active.map((goal) => (
                  <li key={goal.id}>
                    <button type="button" onClick={() => then(() => router.push(`/goals?contribute=${goal.id}`))}
                      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/70">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-foreground/75"><GoalIcon value={goal.emoji} className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">{goal.name}</span>
                        <span className="tabular block text-[0.8125rem] text-muted-foreground">{formatMoney(goal.saved_minor)} of {formatMoney(goal.target_minor)}</span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground/50" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </IosSheet>
      <AddPlannedSheet open={planning} onOpenChange={setPlanning} />
    </>
  )
}
