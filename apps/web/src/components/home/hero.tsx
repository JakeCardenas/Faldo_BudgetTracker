"use client"

import Link from "next/link"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleUserRound, Flame, Search } from "lucide-react"
import { BambooDecor, environmentStyle } from "@/components/brand/environment"
import { Panda } from "@/components/brand/panda"
import { StatusBarTint } from "@/components/brand/status-bar-tint"
import { BalanceLine, type BalancePointValue } from "@/components/charts/charts"
import { HideAmountsButton } from "@/components/finance/hide-amounts"
import { AnimatedMoney } from "@/components/finance/money"
import { useFaldoNote } from "@/components/home/sections"
import { useAppActions } from "@/components/layout/app-context"
import { Notifications } from "@/components/layout/notifications"
import { Skeleton } from "@/components/ui/skeleton"
import { environmentFor, poseFor } from "@/lib/catalog"
import { formatDate, formatMoney, greeting } from "@/lib/format"
import { maskAmounts } from "@/lib/privacy"
import { useBalanceHistory, useEngagement, useMe } from "@/lib/queries"
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

/** Faldo's speech bubble: the one thing worth knowing right now. */
function FaldoBubble({ data, className }: { data: Dashboard; className?: string }) {
  const { note, isLoading } = useFaldoNote(data)
  return (
    <div className={cn("relative min-w-0 rounded-[1.25rem] bg-card p-4 text-card-foreground shadow-[0_18px_36px_-18px_rgb(0_0_0/0.45)]", className)}>
      <span aria-hidden className="absolute top-8 -left-1.5 size-3.5 rotate-45 rounded-[3px] bg-card lg:top-auto lg:-bottom-1.5 lg:left-1/2 lg:-translate-x-1/2" />
      <p className="relative text-[0.8125rem] font-bold text-primary">Faldo</p>
      {isLoading && !note ? (
        <div className="relative mt-2 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
      ) : note ? (
        <div className="relative">
          {note.title && <p className="mt-0.5 text-[0.875rem] leading-snug font-semibold">{maskAmounts(note.title)}</p>}
          <p className={cn("mt-0.5 text-[0.8125rem] leading-snug", note.title ? "text-muted-foreground" : "line-clamp-4 text-foreground/80")}>{maskAmounts(note.body)}</p>
          <Link href={note.href} className="mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
            {note.cta} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : <p className="relative mt-0.5 text-[0.8125rem] leading-snug text-foreground/80">You&apos;re all set. Log what you spend and I&apos;ll keep an eye on the rest.</p>}
    </div>
  )
}

/** A glass button on the green band. */
const bandButton = "glass-on-green pressable relative flex size-11 items-center justify-center rounded-full text-white"

/**
 * The top of Home: Faldo's green bamboo band with the greeting, and Faldo beside his note. On phones
 * the streak and the search, notifications and Profile buttons sit in their own row under the status bar.
 */
export function HomeBand({ data }: { data: Dashboard }) {
  const { data: me } = useMe()
  const { data: engagement } = useEngagement()
  const { openSearch } = useAppActions()
  const name = me?.display_name?.split(" ")[0]
  const pose = poseFor(me?.settings.mascot_outfit)
  const streak = engagement?.current_streak ?? 0

  return (
    <section data-band aria-label="Welcome" style={environmentStyle(me?.settings.home_background)}
      className="relative isolate -mx-5 overflow-hidden px-5 pt-[calc(var(--top-inset)+0.625rem)] text-white sm:-mx-6 sm:px-7 lg:mx-0 lg:mt-7 lg:rounded-[2rem] lg:px-10 lg:pt-8">
      <StatusBarTint color={`color-mix(in oklab, ${environmentFor(me?.settings.home_background).from} 88%, ${environmentFor(me?.settings.home_background).to})`} />
      <BambooDecor className="absolute top-0 -right-8 -z-10 h-[18rem] lg:top-auto lg:right-2 lg:-bottom-12 lg:h-[26rem]" />

      <div className="flex items-center justify-between lg:hidden">
        <Link href="/streaks" onClick={() => play("tap")} className={bandButton}
          aria-label={streak ? `Streak, ${streak} ${streak === 1 ? "day" : "days"}` : "Streaks"}>
          <Flame className="size-5 text-[#ffb35c]" strokeWidth={2} fill="currentColor" fillOpacity={0.35} />
          {streak > 0 && (
            <span className="tabular absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f5713a] px-1 text-[0.6875rem] font-bold text-white ring-2 ring-[#1f5436]">
              {streak > 99 ? "99+" : streak}
            </span>
          )}
        </Link>
        <div className="glass-on-green flex items-center gap-0.5 rounded-full p-1">
          <button type="button" onClick={openSearch} aria-label="Search"
            className="pressable flex size-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15">
            <Search className="size-[1.1rem]" strokeWidth={2} />
          </button>
          <Notifications tone="light" />
          <Link href="/you" aria-label="Profile" onClick={() => play("tap")}
            className="pressable flex size-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15">
            <CircleUserRound className="size-[1.15rem]" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end lg:gap-10">
        <div className="pt-5 lg:pt-0 lg:pb-9">
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-white/75 uppercase">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
          <h1 className="mt-1 truncate text-[1.625rem] leading-tight font-normal tracking-[-0.03em] lg:text-[2.125rem]">
            {greeting()}{name ? <>, <span className="font-extrabold">{name}</span>!</> : ""}
          </h1>
        </div>

        {/* Faldo stands on the band's lower edge with his note beside him. */}
        <div className="mt-3 flex items-end gap-2 lg:mt-0 lg:flex-col-reverse lg:items-center lg:gap-3">
          <Panda pose={pose} priority sizes="(min-width: 1024px) 208px, 144px"
            className="pointer-events-none -mb-5 -ml-2 w-[8.25rem] shrink-0 drop-shadow-[0_12px_18px_rgb(0_0_0/0.22)] min-[390px]:w-[9rem] sm:w-[10rem] lg:-mb-6 lg:ml-0 lg:w-52" />
          <FaldoBubble data={data} className="mb-5 flex-1 lg:mb-0 lg:w-full lg:flex-none" />
        </div>
      </div>
    </section>
  )
}

/** Long balances step down a size so they always fit their card. */
function balanceSize(text: string) {
  if (text.length <= 10) return "text-[2rem]"
  if (text.length <= 12) return "text-[1.75rem]"
  return "text-[1.5rem]"
}

/**
 * What you have and how it has moved: the total balance with its real balance history. Drag across the
 * line to read any day; the amount above follows your finger.
 */
export function BalanceCard({ data, className }: { data: Dashboard; className?: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1])
  const [hover, setHover] = useState<BalancePointValue | null>(null)
  const { data: history, isLoading } = useBalanceHistory(range.days)
  const series = (history ?? []).map((p) => ({ date: p.date, value: p.net_minor }))
  const current = data.overview.total_balance_minor
  const shown = hover?.value ?? current
  const first = series[0]?.value
  const change = first !== undefined ? current - first : null
  const pct = first ? ((change ?? 0) / Math.abs(first)) * 100 : null
  const accounts = data.accounts.filter((a) => !a.archived).length

  return (
    <section aria-labelledby="balance-title" className={cn("card-surface p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <h2 id="balance-title" className="label-caps">Total balance</h2>
          <HideAmountsButton className="-my-1 size-7" />
        </div>
        <p className="text-xs text-muted-foreground">{accounts} {accounts === 1 ? "account" : "accounts"}</p>
      </div>
      <AnimatedMoney minor={shown} className={cn("mt-1.5 block leading-none font-extrabold tracking-[-0.04em] lg:text-[2.5rem]", balanceSize(formatMoney(shown)))} />
      <p className="mt-2 flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-muted-foreground">
        {hover ? (
          <span className="font-semibold text-foreground">{format(parseISO(hover.date), "EEEE, MMM d")}</span>
        ) : change !== null && change !== 0 ? (
          <>
            <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold",
              change > 0 ? "bg-income-soft text-income" : "bg-danger-soft text-expense")}>
              {change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {formatMoney(Math.abs(change))}{pct !== null && Number.isFinite(pct) && ` (${Math.abs(pct).toFixed(1)}%)`}
            </span>
            <span>{range.phrase}</span>
          </>
        ) : <>No change over the {range.phrase}</>}
      </p>

      <div className="mt-3 h-36 lg:h-48">
        {isLoading ? <Skeleton className="h-full rounded-xl" /> : series.length > 1 ? (
          <BalanceLine data={series} onHover={setHover} height="100%" />
        ) : (
          <p className="flex h-full items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">Your balance line appears after a few days of activity.</p>
        )}
      </div>
      <div className="mt-3 flex justify-between gap-1 rounded-full bg-muted p-1" role="radiogroup" aria-label="Chart range">
        {RANGES.map((r) => (
          <button key={r.label} type="button" role="radio" aria-checked={r.label === range.label}
            onClick={() => { play("select"); setRange(r); setHover(null) }}
            className={cn("h-8 flex-1 rounded-full text-[0.8125rem] font-semibold transition-colors",
              r.label === range.label ? "bg-primary text-primary-foreground shadow-[0_1px_3px_rgb(16_36_24/0.2)]" : "text-muted-foreground hover:text-foreground")}>
            {r.label}
          </button>
        ))}
      </div>
    </section>
  )
}
