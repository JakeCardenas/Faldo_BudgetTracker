"use client"

import Link from "next/link"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Search } from "lucide-react"
import { BambooDecor, environmentStyle } from "@/components/brand/environment"
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

/** Faldo's speech bubble beside the panda on larger screens. */
function FaldoBubble({ data }: { data: Dashboard }) {
  const { note, isLoading } = useFaldoNote(data)
  return (
    <div className="relative w-full rounded-2xl bg-white/95 p-4 text-[#101411] shadow-[0_18px_40px_-20px_rgb(0_0_0/0.5)] dark:bg-[#1a1e1b]/95 dark:text-[#eceeec]">
      <span aria-hidden className="absolute -bottom-2 left-1/2 size-4 -translate-x-1/2 rotate-45 rounded-[3px] bg-inherit" />
      <p className="text-xs font-semibold text-[#2c7549] dark:text-[#7ccb93]">Faldo</p>
      {isLoading && !note ? (
        <div className="mt-2 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
      ) : note ? (
        <>
          {note.title && <p className="mt-1 text-[0.9375rem] font-semibold tracking-[-0.01em]">{maskAmounts(note.title)}</p>}
          <p className={cn("mt-1 text-sm leading-snug", note.title ? "opacity-75" : "line-clamp-4")}>{maskAmounts(note.body)}</p>
          <Link href={note.href} className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-[#2c7549] hover:opacity-80 dark:text-[#7ccb93]">
            {note.cta} <ArrowRight className="size-3.5" />
          </Link>
        </>
      ) : <p className="mt-1 text-sm opacity-75">You&apos;re all set. Log what you spend and I&apos;ll keep an eye on the rest.</p>}
    </div>
  )
}

/**
 * The Home centerpiece: what you have and how it has moved, in Faldo's green environment, with
 * Faldo beside it. Every figure is from the backend; the chart is the real balance history.
 */
export function BalanceHero({ data }: { data: Dashboard }) {
  const { data: me } = useMe()
  const { openSearch } = useAppActions()
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1])
  const [hover, setHover] = useState<BalancePointValue | null>(null)
  const { data: history, isLoading } = useBalanceHistory(range.days)
  const series = (history ?? []).map((p) => ({ date: p.date, value: p.net_minor }))
  const current = data.overview.total_balance_minor
  const first = series[0]?.value
  const change = first !== undefined ? current - first : null
  const pct = first ? ((change ?? 0) / Math.abs(first)) * 100 : null
  const name = me?.display_name?.split(" ")[0]
  const pose = poseFor(me?.settings.mascot_outfit)
  const accounts = data.accounts.filter((a) => !a.archived).length

  return (
    <section aria-labelledby="balance-title" style={environmentStyle(me?.settings.home_background)}
      className="relative isolate -mx-4 overflow-hidden px-5 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-12 text-white sm:-mx-6 sm:px-7 lg:mx-0 lg:mt-7 lg:rounded-[2rem] lg:px-10 lg:pt-9 lg:pb-9">
      <BambooDecor className="absolute -right-6 -bottom-10 -z-10 h-[26rem] lg:right-[18rem] lg:h-[30rem]" />
      <BambooDecor side="left" className="absolute -bottom-24 -left-10 -z-10 hidden h-80 lg:block" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-white/75">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
          <h1 className="mt-0.5 truncate text-[1.5rem] leading-tight font-semibold tracking-[-0.03em] lg:text-[1.75rem]">{greeting()}{name ? `, ${name}` : ""}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <button type="button" onClick={openSearch} aria-label="Search"
            className="pressable flex size-10 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white/20">
            <Search className="size-[1.15rem]" strokeWidth={2} />
          </button>
          <Notifications tone="light" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="relative min-w-0">
          {/* Faldo sits beside the balance on phones, just above the line. */}
          <Panda pose={pose} priority sizes="136px" className="pointer-events-none absolute -top-5 right-0 w-[7.5rem] drop-shadow-[0_14px_22px_rgb(0_0_0/0.28)] sm:w-[8.5rem] lg:hidden" />

          <div className="flex items-center gap-1 pr-32 sm:pr-36 lg:pr-0">
            <h2 id="balance-title" className="text-[0.9375rem] text-white/80">Total balance</h2>
            <HideAmountsButton tone="light" className="-my-1" />
          </div>
          <AnimatedMoney minor={hover?.value ?? current} className="mt-1 block text-[clamp(2.4rem,11vw,3.5rem)] leading-none font-semibold tracking-[-0.045em]" symbolClassName="text-white/70" />
          <p className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 pr-[7.25rem] text-sm text-white/85 sm:pr-36 lg:pr-0">
            {hover ? (
              <>{format(parseISO(hover.date), "EEEE, MMM d")}</>
            ) : change !== null && change !== 0 ? (
              <>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-white/14 px-2 py-0.5 font-medium text-white">
                  {change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {formatMoney(Math.abs(change))}{pct !== null && Number.isFinite(pct) && ` (${Math.abs(pct).toFixed(1)}%)`}
                </span>
                <span>{range.phrase}</span>
              </>
            ) : (
              <>Across {accounts} {accounts === 1 ? "account" : "accounts"}</>
            )}
          </p>

          <div className="-mx-2.5 mt-3 h-[10.5rem] sm:h-48 lg:h-56">
            {isLoading ? <Skeleton className="mx-2.5 h-full rounded-2xl bg-white/10" /> : series.length > 1 ? (
              <BalanceLine data={series} tone="light" onHover={setHover} height="100%" />
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-white/75">Your balance line appears after a few days of activity.</p>
            )}
          </div>
          <div className="mt-2 flex justify-between gap-1 sm:justify-start" role="radiogroup" aria-label="Chart range">
            {RANGES.map((r) => (
              <button key={r.label} type="button" role="radio" aria-checked={r.label === range.label}
                onClick={() => { play("select"); setRange(r); setHover(null) }}
                className={cn("h-8 min-w-12 rounded-full px-3 text-[0.8125rem] font-semibold transition-colors",
                  r.label === range.label ? "bg-white text-[#17462c]" : "text-white/80 hover:bg-white/12 hover:text-white")}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <aside className="hidden flex-col items-center justify-end gap-3 lg:flex" aria-label="Faldo">
          <FaldoBubble data={data} />
          <Panda pose={pose} priority sizes="260px" className="w-52 drop-shadow-[0_22px_32px_rgb(0_0_0/0.3)] xl:w-60" />
        </aside>
      </div>
    </section>
  )
}
