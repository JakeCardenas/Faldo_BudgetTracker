"use client"

import Link from "next/link"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, CircleUserRound, Flame, MessageCircle, Search, Settings, WalletMinimal } from "lucide-react"
import { Panda } from "@/shared/ui/brand/panda"
import { BalanceLine, type BalancePointValue } from "@/shared/ui/charts/charts"
import { HideAmountsButton } from "@/features/hide-amounts"
import { AnimatedMoney, Money } from "@/shared/ui/money/money"
import { useFaldoNote } from "./sections"
import { useAppActions } from "@/shared/lib/app-actions"
import { Notifications } from "@/features/notifications"
import { Skeleton } from "@/shared/ui/skeleton"
import { poseFor, useEngagement } from "@/entities/engagement"
import { formatDate, formatMoney, greeting } from "@/shared/lib/format"
import { maskAmounts } from "@/shared/lib/privacy"
import { useBalanceHistory } from "@/entities/account"
import { useMe } from "@/entities/session"
import { play } from "@/shared/lib/sound"
import type { Dashboard } from "@/shared/api/types"
import { cn } from "@/shared/lib/utils"

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

/** Faldo's note: the one thing worth knowing right now, and a way to ask him about it. */
function FaldoNote({ data, className }: { data: Dashboard; className?: string }) {
  const { note, isLoading } = useFaldoNote(data)
  const askElsewhere = !note || note.href !== "/assistant"
  return (
    <div className={cn("relative min-w-0 rounded-[1.25rem] bg-card p-4 text-card-foreground shadow-[0_14px_30px_-18px_rgb(17_24_39/0.45)]", className)}>
      <span aria-hidden className="absolute top-7 -left-1.5 size-3.5 rotate-45 rounded-[3px] bg-card" />
      <p className="relative text-[0.8125rem] font-bold text-primary">Faldo</p>
      {isLoading && !note ? (
        <div className="relative mt-2 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
      ) : note ? (
        <div className="relative">
          {note.title && <p className="mt-0.5 text-[0.875rem] leading-snug font-semibold">{maskAmounts(note.title)}</p>}
          <p className={cn("mt-0.5 text-[0.8125rem] leading-snug", note.title ? "text-muted-foreground" : "line-clamp-5 text-foreground/80")}>{maskAmounts(note.title ? note.body : firstSentences(note.body))}</p>
        </div>
      ) : <p className="relative mt-0.5 text-[0.8125rem] leading-snug text-foreground/80">You&apos;re all set. Log what you spend and I&apos;ll keep an eye on the rest.</p>}
      <div className="relative mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {note && (
          <Link href={note.href} className="hit inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
            {note.cta} <ArrowRight className="size-3.5" />
          </Link>
        )}
        {askElsewhere && (
          <Link href="/assistant" className="hit inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
            <MessageCircle className="size-3.5" /> Ask Faldo
          </Link>
        )}
      </div>
    </div>
  )
}

/** A round utility control on the canvas: Faldo's green icon, a soft wash when pressed or hovered. */
const utility = "pressable hit relative flex size-9 items-center justify-center rounded-full text-primary transition-colors hover:bg-secondary"

/**
 * The top of Home on the canvas: the streak and the search, notifications, Profile and Settings controls on phones
 * (desktop has them in the sidebar), then the date and the greeting.
 */
export function HomeHeader() {
  const { data: me } = useMe()
  const { data: engagement } = useEngagement()
  const { openSearch } = useAppActions()
  const name = me?.display_name?.split(" ")[0]
  const streak = engagement?.current_streak ?? 0

  return (
    <header className="pt-[calc(var(--top-inset)+0.75rem)] lg:pt-10">
      <div className="flex items-center justify-between lg:hidden">
        <Link href="/streaks" onClick={() => play("tap")} aria-label={streak ? `Streak, ${streak} ${streak === 1 ? "day" : "days"}` : "Streaks"}
          className="pressable hit relative flex size-11 items-center justify-center rounded-full bg-card shadow-(--shadow-card)">
          <Flame className="size-5 text-flame" strokeWidth={2} fill="currentColor" fillOpacity={0.3} />
          {streak > 0 && (
            <span className="tabular absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-flame px-1 text-[0.6875rem] font-bold text-white ring-2 ring-background">
              {streak > 99 ? "99+" : streak}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-0.5 rounded-full bg-card p-1 shadow-(--shadow-card)">
          <button type="button" onClick={openSearch} aria-label="Search" className={utility}>
            <Search className="size-[1.1rem]" strokeWidth={2} />
          </button>
          <Notifications />
          <Link href="/you" aria-label="Profile" onClick={() => play("tap")} className={utility}>
            <CircleUserRound className="size-[1.15rem]" strokeWidth={2} />
          </Link>
          <Link href="/settings" aria-label="Settings" onClick={() => play("tap")} className={utility}>
            <Settings className="size-[1.1rem]" strokeWidth={2} />
          </Link>
        </div>
      </div>
      <p className="label-caps mt-5 lg:mt-0">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
      <h1 className="mt-1 truncate text-[1.625rem] leading-tight font-normal tracking-[-0.03em] lg:text-[2rem]">
        {greeting()}{name ? <>, <span className="font-extrabold">{name}</span>!</> : ""}
      </h1>
    </header>
  )
}

/**
 * Faldo beside his note, on a green strip that runs edge to edge on phones (a rounded panel from desktop up). He is
 * smaller than the money under him: a companion, not the headline. The note is also the way into talking to him.
 */
export function FaldoPanel({ data }: { data: Dashboard }) {
  const { data: me } = useMe()
  const pose = poseFor(me?.settings.mascot_outfit)
  return (
    <section aria-label="Faldo" className="relative -mx-5 mt-3 overflow-hidden sm:-mx-6 lg:mx-0 lg:rounded-[1.5rem]">
      <div aria-hidden className="absolute inset-x-0 top-10 bottom-0 bg-hero lg:top-8" />
      <div className="relative flex items-end gap-2 px-4 pb-4 sm:px-6 lg:px-6">
        <Panda pose={pose} priority sizes="(min-width: 1024px) 144px, 120px"
          className="pointer-events-none -mb-6 -ml-1 w-[6.5rem] shrink-0 drop-shadow-[0_10px_16px_rgb(0_0_0/0.2)] min-[390px]:w-[7.25rem] lg:w-36" />
        <FaldoNote data={data} className="mt-2 flex-1" />
      </div>
    </section>
  )
}

/** The total across accounts in one line under the status cards; the Wallet has the detail. */
export function BalanceRow({ data, className }: { data: Dashboard; className?: string }) {
  const accounts = data.accounts.filter((a) => !a.archived).length
  return (
    <Link href="/accounts" onClick={() => play("tap")} className={cn("card-surface pressable flex items-center gap-3 px-4 py-3.5", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-secondary text-primary"><WalletMinimal className="size-5" strokeWidth={2} /></span>
      <span className="min-w-0 flex-1">
        <span className="label-caps block">Total balance</span>
        <span className="block text-[0.8125rem] text-muted-foreground">{accounts} {accounts === 1 ? "account" : "accounts"}</span>
      </span>
      <Money minor={data.overview.total_balance_minor} className="font-money text-[1.25rem] font-extrabold tracking-[-0.02em]" />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
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
              r.label === range.label ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(17_24_39/0.12)] dark:shadow-none"
                : "text-muted-foreground hover:text-foreground")}>
            {r.label}
          </button>
        ))}
      </div>
    </section>
  )
}
