"use client"

import Link from "next/link"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleUserRound, Flame, Search } from "lucide-react"
import { BAND_STYLE, BAND_TINT, BambooDecor } from "@/components/brand/environment"
import { Panda } from "@/components/brand/panda"
import { StatusBarTint } from "@/components/brand/status-bar-tint"
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
import { useBalanceHistory, useEngagement, useMe } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"

const RANGES = [
  { label: "1W", days: 7, phrase: "past week" },
  { label: "1M", days: 30, phrase: "past month" },
  { label: "3M", days: 90, phrase: "past 3 months" },
  { label: "6M", days: 180, phrase: "past 6 months" },
  { label: "1Y", days: 365, phrase: "past year" },
] as const

/** Whole sentences only, as many as fit in about four lines, so the note never stops mid-word. */
function firstSentences(text: string, max = 120) {
  let out = ""
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (out && out.length + sentence.length + 1 > max) break
    out = out ? `${out} ${sentence}` : sentence
  }
  return out
}

/** Faldo's speech bubble: the one thing worth knowing right now. */
function FaldoBubble({ data, className }: { data: Dashboard; className?: string }) {
  const { note, isLoading } = useFaldoNote(data)
  return (
    <div className={cn("relative min-w-0 rounded-[1.25rem] bg-card p-4 text-card-foreground shadow-[0_18px_36px_-18px_rgb(0_0_0/0.45)]", className)}>
      <span aria-hidden className="absolute top-8 -left-1.5 size-3.5 rotate-45 rounded-[3px] bg-card lg:top-auto lg:bottom-8 lg:left-auto lg:-right-1.5" />
      <p className="relative text-[0.8125rem] font-bold text-primary">Faldo</p>
      {isLoading && !note ? (
        <div className="relative mt-2 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
      ) : note ? (
        <div className="relative">
          {note.title && <p className="mt-0.5 text-[0.875rem] leading-snug font-semibold">{maskAmounts(note.title)}</p>}
          <p className={cn("mt-0.5 text-[0.8125rem] leading-snug", note.title ? "text-muted-foreground" : "line-clamp-5 text-foreground/80")}>{maskAmounts(note.title ? note.body : firstSentences(note.body))}</p>
          <Link href={note.href} className="hit mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
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
    <section data-band aria-label="Welcome" style={BAND_STYLE}
      className="relative isolate -mx-5 overflow-hidden px-5 pt-[calc(var(--top-inset)+0.625rem)] text-white sm:-mx-6 sm:px-7 lg:mx-0 lg:mt-7 lg:flex lg:min-h-56 lg:flex-col lg:justify-end lg:rounded-[2rem] lg:px-10 lg:pt-8">
      <StatusBarTint color={BAND_TINT} />
      <BambooDecor />

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
            className="pressable hit flex size-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15">
            <Search className="size-[1.1rem]" strokeWidth={2} />
          </button>
          <Notifications tone="light" />
          <Link href="/you" aria-label="Profile" onClick={() => play("tap")}
            className="pressable hit flex size-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15">
            <CircleUserRound className="size-[1.15rem]" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10">
        <div className="pt-5 lg:pt-0 lg:pb-9">
          <p className="text-[0.8125rem] font-semibold tracking-[-0.005em] text-white/85">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
          <h1 className="mt-1 truncate text-[1.625rem] leading-tight font-normal tracking-[-0.03em] lg:text-[2.125rem]">
            {greeting()}{name ? <>, <span className="font-extrabold">{name}</span>!</> : ""}
          </h1>
        </div>

        {/* Faldo stands on the band's lower edge with his note beside him; on desktop he stands in the grove on the
            right and the note sits to his left, so the band stays short. */}
        <div className="mt-3 flex items-end gap-2 lg:mt-0 lg:flex-row-reverse lg:gap-3">
          <Panda pose={pose} priority sizes="(min-width: 1024px) 176px, 144px"
            className="pointer-events-none -mb-5 -ml-2 w-[8.25rem] shrink-0 drop-shadow-[0_12px_18px_rgb(0_0_0/0.22)] min-[390px]:w-[9rem] sm:w-[10rem] lg:-mb-6 lg:ml-0 lg:w-44" />
          <FaldoBubble data={data} className="mb-5 flex-1 lg:mb-9 lg:w-[21rem] lg:flex-none" />
        </div>
      </div>
    </section>
  )
}

/** Long balances step down a size so they always fit their card. */
function balanceSize(text: string) {
  if (text.length <= 10) return "text-[2.625rem]"
  if (text.length <= 12) return "text-[2.25rem]"
  return "text-[1.875rem]"
}

/** The change from the start of the range, as a pill that says up or down in words and colour. */
function ChangePill({ change, pct }: { change: number; pct: number | null }) {
  const up = change > 0
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold", up ? "bg-income-soft text-income" : "bg-danger-soft text-expense")}>
      {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
      <span className="sr-only">{up ? "Up" : "Down"} </span>
      <span className="tabular">{formatMoney(Math.abs(change))}{pct !== null && Number.isFinite(pct) && ` (${Math.abs(pct).toFixed(1)}%)`}</span>
    </span>
  )
}

/**
 * What you have and how it has moved: the total balance, the change over the chosen range, the balance
 * history with a dashed line where the range began, and the range picker. Drag across the line to read
 * any day; the amount and the change above follow your finger.
 */
export function BalanceCard({ data, className }: { data: Dashboard; className?: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1])
  const [hover, setHover] = useState<BalancePointValue | null>(null)
  const { data: history, isLoading } = useBalanceHistory(range.days)
  const series = (history ?? []).map((p) => ({ date: p.date, value: p.net_minor }))
  const current = data.overview.total_balance_minor
  const shown = hover?.value ?? current
  const first = series[0]?.value
  const change = first !== undefined ? shown - first : null
  const pct = first ? ((change ?? 0) / Math.abs(first)) * 100 : null
  const accounts = data.accounts.filter((a) => !a.archived).length

  return (
    <section aria-labelledby="balance-title" className={cn("card-surface rounded-[1.5rem] p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <h2 id="balance-title" className="label-caps">Total balance</h2>
          <HideAmountsButton className="-my-1 size-7" />
        </div>
        <p className="text-xs text-muted-foreground">{accounts} {accounts === 1 ? "account" : "accounts"}</p>
      </div>
      <AnimatedMoney minor={shown} className={cn("mt-2 block leading-none font-extrabold tracking-[-0.025em] lg:text-[2.75rem]", balanceSize(formatMoney(shown)))} />
      <p className="mt-2.5 flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-muted-foreground" aria-live="polite">
        {hover && <span className="font-semibold text-foreground">{format(parseISO(hover.date), "EEE, MMM d")}</span>}
        {change !== null && change !== 0 ? (
          <>
            <ChangePill change={change} pct={pct} />
            <span>{hover ? `since ${format(parseISO(series[0].date), "MMM d")}` : `over the ${range.phrase}`}</span>
          </>
        ) : !hover && <>No change over the {range.phrase}</>}
      </p>

      <div className="mt-4 h-40 lg:h-48">
        {isLoading ? <Skeleton className="h-full rounded-xl" /> : series.length > 1 ? (
          <BalanceLine data={series} onHover={setHover} height="100%" startLine />
        ) : (
          <p className="flex h-full items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">Your balance line appears after a few days of activity.</p>
        )}
      </div>
      <div className="mx-auto mt-4 flex w-full rounded-full bg-muted p-1 sm:max-w-sm" role="radiogroup" aria-label="Chart range">
        {RANGES.map((r) => (
          <button key={r.label} type="button" role="radio" aria-checked={r.label === range.label}
            onClick={() => { play("select"); setRange(r); setHover(null) }}
            className={cn("pressable hit h-8 flex-1 rounded-full text-[0.8125rem] font-semibold transition-[background-color,color,box-shadow] duration-200",
              r.label === range.label ? "bg-card text-foreground shadow-[0_1px_3px_rgb(16_36_24/0.1),0_0_0_0.5px_rgb(16_36_24/0.05)] dark:bg-accent dark:shadow-none"
                : "text-muted-foreground hover:text-foreground")}>
            {r.label}
          </button>
        ))}
      </div>
    </section>
  )
}
