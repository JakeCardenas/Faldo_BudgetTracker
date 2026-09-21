"use client"

import Link from "next/link"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Search } from "lucide-react"
import { environmentStyle } from "@/components/brand/environment"
import { Panda } from "@/components/brand/panda"
import { BalanceLine, type BalancePointValue } from "@/components/charts/charts"
import { HideAmountsButton } from "@/components/finance/hide-amounts"
import { AnimatedMoney } from "@/components/finance/money"
import { useFaldoNote } from "@/components/home/sections"
import { useAppActions } from "@/components/layout/app-context"
import { Notifications } from "@/components/layout/notifications"
import { Skeleton } from "@/components/ui/skeleton"
import { poseFor } from "@/lib/catalog"
import { formatDate, formatMoney, greeting } from "@/lib/format"
import { maskAmounts } from "@/lib/privacy"
import { useBalanceHistory, useMe } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"

const RANGES = [
  { label: "1W", days: 7, phrase: "past week" },
  { label: "1M", days: 30, phrase: "past month" },
  { label: "3M", days: 90, phrase: "3 months" },
  { label: "6M", days: 180, phrase: "6 months" },
  { label: "1Y", days: 365, phrase: "past year" },
] as const

/** Long balances step down a size on phones so they never collide with Faldo. */
function balanceSize(text: string) {
  if (text.length <= 8) return "text-[clamp(2.25rem,10.2vw,3.5rem)]"
  if (text.length <= 10) return "text-[clamp(1.9rem,8.6vw,3.25rem)]"
  return "text-[clamp(1.6rem,7.2vw,3rem)]"
}

/** Faldo's speech bubble beside the panda on larger screens. */
function FaldoBubble({ data }: { data: Dashboard }) {
  const { note, isLoading } = useFaldoNote(data)
  return (
    <div className="relative w-full rounded-2xl bg-card p-4 text-card-foreground shadow-(--elevation-card) ring-1 ring-foreground/[0.04]">
      <span aria-hidden className="absolute -bottom-1.5 left-1/2 size-3.5 -translate-x-1/2 rotate-45 rounded-[3px] bg-card" />
      <p className="text-xs font-semibold text-primary">Faldo</p>
      {isLoading && !note ? (
        <div className="mt-2 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
      ) : note ? (
        <>
          {note.title && <p className="mt-1 text-[0.9375rem] font-semibold tracking-[-0.01em]">{maskAmounts(note.title)}</p>}
          <p className={cn("mt-1 text-sm leading-snug text-muted-foreground", !note.title && "line-clamp-4")}>{maskAmounts(note.body)}</p>
          <Link href={note.href} className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
            {note.cta} <ArrowRight className="size-3.5" />
          </Link>
        </>
      ) : <p className="mt-1 text-sm text-muted-foreground">You&apos;re all set. Log what you spend and I&apos;ll keep an eye on the rest.</p>}
    </div>
  )
}

/**
 * The Home centrepiece: what you have and how it has moved, in Faldo's light environment, with Faldo
 * beside the balance. Every figure is from the backend; the chart is the real balance history.
 */
export function BalanceHero({ data }: { data: Dashboard }) {
  const { data: me } = useMe()
  const { openSearch } = useAppActions()
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1])
  const [hover, setHover] = useState<BalancePointValue | null>(null)
  const { data: history, isLoading } = useBalanceHistory(range.days)
  const series = (history ?? []).map((p) => ({ date: p.date, value: p.net_minor }))
  const current = data.overview.total_balance_minor
  const shown = hover?.value ?? current
  const first = series[0]?.value
  const change = first !== undefined ? current - first : null
  const pct = first ? ((change ?? 0) / Math.abs(first)) * 100 : null
  const name = me?.display_name?.split(" ")[0]
  const pose = poseFor(me?.settings.mascot_outfit)
  const accounts = data.accounts.filter((a) => !a.archived).length

  return (
    <section aria-labelledby="balance-title" style={environmentStyle(me?.settings.home_background)}
      className="faldo-env relative isolate -mx-4 overflow-hidden px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-5 sm:-mx-6 sm:px-7 lg:mx-0 lg:mt-7 lg:rounded-[2rem] lg:px-10 lg:pt-9 lg:pb-8">
      {/* Phones: the environment melts into the page instead of ending on a hard line. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-20 bg-linear-to-b from-transparent to-background lg:hidden" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
          <h1 className="mt-0.5 truncate text-[1.375rem] leading-tight font-semibold tracking-[-0.03em] lg:text-[1.75rem]">{greeting()}{name ? `, ${name}` : ""}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
          <button type="button" onClick={openSearch} aria-label="Search"
            className="pressable flex size-10 items-center justify-center rounded-full bg-card/70 text-foreground ring-1 ring-foreground/[0.05] hover:bg-card">
            <Search className="size-[1.15rem]" strokeWidth={2} />
          </button>
          <Notifications tone="surface" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-14">
        <div className="min-w-0">
          {/* Phones: Faldo stands beside the balance, above the line, never over it. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 lg:block">
            <div className="min-w-0 pb-1 lg:pb-0">
              <div className="flex items-center gap-1">
                <h2 id="balance-title" className="text-[0.9375rem] text-muted-foreground">Total balance</h2>
                <HideAmountsButton className="-my-1" />
              </div>
              <AnimatedMoney minor={shown} className={cn("mt-1 block leading-none font-semibold tracking-[-0.045em] lg:text-[3.5rem]", balanceSize(formatMoney(shown)))} symbolClassName="text-muted-foreground" />
              <p className="mt-2.5 flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                {hover ? (
                  <span className="font-medium text-foreground">{format(parseISO(hover.date), "EEEE, MMM d")}</span>
                ) : change !== null && change !== 0 ? (
                  <>
                    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold",
                      change > 0 ? "bg-income-soft text-income" : "bg-card/80 text-foreground")}>
                      {change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                      {formatMoney(Math.abs(change))}{pct !== null && Number.isFinite(pct) && ` (${Math.abs(pct).toFixed(1)}%)`}
                    </span>
                    <span>{range.phrase}</span>
                  </>
                ) : (
                  <>Across {accounts} {accounts === 1 ? "account" : "accounts"}</>
                )}
              </p>
            </div>
            <Panda pose={pose} priority sizes="(min-width: 768px) 200px, (min-width: 640px) 176px, 148px" className="pointer-events-none -mr-1 w-[8.75rem] min-[390px]:w-[9.25rem] sm:w-[11rem] md:w-[12.5rem] lg:hidden" />
          </div>

          <div className="mt-3 h-[11rem] sm:h-52 lg:mt-5 lg:h-60">
            {isLoading ? <Skeleton className="h-full rounded-2xl bg-foreground/[0.05]" /> : series.length > 1 ? (
              <BalanceLine data={series} onHover={setHover} height="100%" />
            ) : (
              <p className="flex h-full items-center justify-center rounded-2xl border border-dashed border-foreground/10 px-6 text-center text-sm text-muted-foreground">Your balance line appears after a few days of activity.</p>
            )}
          </div>
          <div className="mt-3 flex justify-between gap-1 rounded-full bg-foreground/[0.04] p-1 sm:inline-flex sm:justify-start" role="radiogroup" aria-label="Chart range">
            {RANGES.map((r) => (
              <button key={r.label} type="button" role="radio" aria-checked={r.label === range.label}
                onClick={() => { play("select"); setRange(r); setHover(null) }}
                className={cn("h-8 min-w-12 flex-1 rounded-full px-3 text-[0.8125rem] font-semibold transition-colors sm:flex-none",
                  r.label === range.label ? "bg-card text-foreground shadow-[0_1px_3px_rgb(16_36_24/0.1)] dark:bg-foreground/[0.14]" : "text-muted-foreground hover:text-foreground")}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <aside className="hidden flex-col items-center justify-end gap-4 lg:flex" aria-label="Faldo">
          <FaldoBubble data={data} />
          <Panda pose={pose} priority sizes="(min-width: 1280px) 288px, 240px" className="w-60 xl:w-72" />
        </aside>
      </div>
    </section>
  )
}
