"use client"

import Link from "next/link"
import { CalendarClock, Flag, HandCoins, LineChart, PiggyBank, Plus, ScanLine, Sparkles, type LucideIcon } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { cn } from "@/lib/utils"

interface Action {
  label: string
  icon: LucideIcon
  href?: string
  mode?: "describe" | "receipt"
}

const ACTIONS: Action[] = [
  { label: "Add", icon: Plus, mode: "describe" },
  { label: "Scan receipt", icon: ScanLine, mode: "receipt" },
  { label: "Budgets", icon: PiggyBank, href: "/budgets" },
  { label: "Goals", icon: Flag, href: "/goals" },
  { label: "Bills", icon: CalendarClock, href: "/bills" },
  { label: "Money owed", icon: HandCoins, href: "/debts" },
  { label: "Forecast", icon: LineChart, href: "/forecast" },
  { label: "Ask Faldo", icon: Sparkles, href: "/assistant" },
]

export function QuickActions() {
  const { openAddTransaction } = useAppActions()
  return (
    <section className="card-surface p-4 sm:p-5">
      <h2 className="px-1 text-[0.95rem] font-bold tracking-tight">Quick actions</h2>
      <div className="mt-3 grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-8">
        {ACTIONS.map((action, i) => {
          const Icon = action.icon
          const tile = (
            <>
              <span className={cn("flex size-12 items-center justify-center rounded-[1.1rem] border transition-all group-hover:-translate-y-0.5 group-active:scale-95 sm:size-13",
                i === 0 ? "border-primary bg-primary text-primary-foreground shadow-(--shadow-card)" : "bg-surface text-primary group-hover:border-primary/30 group-hover:bg-secondary")}>
                <Icon className="size-5" strokeWidth={2} />
              </span>
              <span className="text-center text-[0.72rem] leading-tight font-semibold text-foreground/80">{action.label}</span>
            </>
          )
          const className = "group flex min-w-0 flex-col items-center gap-2 rounded-2xl py-1 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
          return action.href ? (
            <Link key={action.label} href={action.href} className={className}>{tile}</Link>
          ) : (
            <button key={action.label} type="button" className={className} onClick={() => openAddTransaction({ mode: action.mode })}>{tile}</button>
          )
        })}
      </div>
    </section>
  )
}
