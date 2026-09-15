"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react"
import { LeafPattern, Mascot } from "@/components/brand/mascot"
import { AnimatedMoney } from "@/components/finance/money"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, formatMoney, greeting } from "@/lib/format"
import { usePulse } from "@/lib/queries"
import type { Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"

type View = "all" | "assets" | "liabilities"

const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "All" },
  { value: "assets", label: "Assets" },
  { value: "liabilities", label: "Liabilities" },
]

export function Hero({ data, name }: { data: Dashboard; name: string }) {
  const { data: pulse, isLoading } = usePulse()
  const [view, setView] = useState<View>("all")
  const accounts = data.accounts.filter((a) => !a.archived)
  const assets = accounts.filter((a) => a.balance_minor > 0)
  const owed = accounts.filter((a) => a.balance_minor < 0)
  const assetTotal = assets.reduce((sum, a) => sum + a.balance_minor, 0)
  const owedTotal = owed.reduce((sum, a) => sum - a.balance_minor, 0)
  const value = view === "all" ? data.overview.total_balance_minor : view === "assets" ? assetTotal : owedTotal
  const change = data.overview.total_balance_change_minor
  const sts = data.safe_to_spend
  const worried = sts.shortfall_minor > 0 || data.budget.lines.some((l) => l.status === "over")

  const caption = view === "all"
    ? "Assets minus liabilities"
    : view === "assets"
      ? `Across ${assets.length} account${assets.length === 1 ? "" : "s"}`
      : owed.length ? `Owed on ${owed.length} account${owed.length === 1 ? "" : "s"}` : "Nothing owed. Nice."

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-hero to-hero-deep text-primary-foreground shadow-(--shadow-float)">
      <LeafPattern className="pointer-events-none absolute inset-0 size-full text-white/[0.05]" />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end lg:gap-8">
        <div className="space-y-4">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-white/65 uppercase">
              {formatDate(new Date().toISOString(), "EEEE, MMMM d")}
            </p>
            <h1 className="mt-1 text-[1.75rem] leading-tight font-medium tracking-tight sm:text-[2.2rem]">
              {greeting()}, <span className="font-extrabold">{name}</span>!
            </h1>
          </div>
          <div className="flex items-center gap-1 sm:items-end sm:gap-2">
            <Mascot mood={worried ? "worried" : "happy"} className="animate-bob -mb-1 w-24 shrink-0 sm:w-32" />
            <div className="relative min-w-0 flex-1 rounded-3xl sm:mb-4 rounded-bl-md bg-card p-4 text-card-foreground shadow-(--shadow-card)">
              <p className="text-xs font-bold text-primary">Faldo</p>
              {isLoading || !pulse ? (
                <div className="space-y-2 pt-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-2/3" /></div>
              ) : (
                <p className="mt-0.5 text-[0.85rem] leading-relaxed sm:text-[0.9rem] text-balance-safe">{pulse.text}</p>
              )}
              <Link href="/assistant?q=Where%20did%20my%20money%20go%20this%20month%3F"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Ask a follow-up <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-card p-5 text-card-foreground shadow-(--shadow-card) sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {view === "liabilities" ? "Total owed" : view === "assets" ? "Total assets" : "Net worth"}
            </p>
            {view === "all" && change !== 0 && (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                change > 0 ? "bg-mint text-mint-foreground" : "bg-warning-soft text-warning")}>
                {change > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {formatMoney(change, "PHP", { signed: true, compact: true })}
              </span>
            )}
          </div>
          <AnimatedMoney minor={value} className="mt-2 block text-[2.4rem] leading-none font-extrabold tracking-tight sm:text-5xl" />
          <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
          <div className="mt-4 flex gap-2" role="group" aria-label="Balance view">
            {VIEWS.map((v) => (
              <button key={v.value} type="button" aria-pressed={view === v.value} onClick={() => setView(v.value)}
                className={cn("h-8 flex-1 rounded-full border text-xs font-semibold transition-colors",
                  view === v.value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted")}>
                {v.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3">
            <div>
              <p className="text-xs font-medium text-secondary-foreground/80">Safe to spend</p>
              <p className="text-xs text-muted-foreground">≈{formatMoney(sts.per_day_minor)}/day · {sts.days_left} days left</p>
            </div>
            <span className={cn("tabular text-lg font-bold", sts.amount_minor <= 0 ? "text-destructive" : "text-secondary-foreground")}>
              {formatMoney(sts.amount_minor)}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
