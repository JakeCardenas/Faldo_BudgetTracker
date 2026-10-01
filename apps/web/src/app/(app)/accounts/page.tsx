"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { ArrowDownRight, ArrowUpRight, ArrowUpDown, ChevronDown, ChevronRight, ChevronUp, FileUp, LayoutGrid, List, Loader2, Plus, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Panda } from "@/shared/ui/brand/panda"
import { AccountDialog } from "@/features/account-edit"
import { EmptyState } from "@/shared/ui/empty-state"
import { HideAmountsButton } from "@/features/hide-amounts"
import { AnimatedMoney } from "@/shared/ui/money/money"
import { Chip } from "@/shared/ui/ios/segmented"
import { HeaderButton } from "@/shared/ui/ios/nav-header"
import { useAppActions } from "@/shared/lib/app-actions"
import { AccountBadge, AccountTile, ACCOUNT_GROUPS, useAccounts, useBalanceHistory } from "@/entities/account"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { api } from "@/shared/api/client"
import { poseFor } from "@/entities/engagement"
import { formatMoney } from "@/shared/lib/format"
import { maskAmounts, useMaskedAmounts } from "@/shared/lib/privacy"
import { useInsights } from "@/entities/insight"
import { useMe } from "@/entities/session"
import { invalidateFinancialData } from "@/shared/api/query-keys"
import { listView } from "@/shared/lib/query-view"
import type { Account, AccountType } from "@/shared/api/types"
import { play } from "@/shared/lib/sound"
import { cn } from "@/shared/lib/utils"

type View = "all" | "assets" | "liabilities"
const VIEW_KEY = "faldo:wallet-view"

function readView(): "grid" | "list" {
  if (typeof window === "undefined") return "grid"
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"
  } catch {
    return "grid"
  }
}

const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "All" }, { value: "assets", label: "Assets" }, { value: "liabilities", label: "Liabilities" },
]
const HISTORY_KEY = { all: "net_minor", assets: "assets_minor", liabilities: "liabilities_minor" } as const

/** The headline figure for the chosen view, with how it moved over the past month. */
function NetWorthCard({ view, headline }: { view: View; headline: { label: string; value: number; caption: string } }) {
  const { data: history } = useBalanceHistory(30)
  const first = history?.[0]?.[HISTORY_KEY[view]]
  const change = first !== undefined ? headline.value - first : null
  const pct = first ? ((change ?? 0) / Math.abs(first)) * 100 : null
  const good = change !== null && (view === "liabilities" ? change <= 0 : change >= 0)
  return (
    <div className="min-w-0 flex-1 rounded-[1.25rem] bg-card p-4 text-card-foreground shadow-[0_14px_30px_-18px_rgb(17_24_39/0.45)]">
      <div className="flex items-center gap-1.5">
        <span className="label-caps">{headline.label}</span>
        {change !== null && change !== 0 && pct !== null && Number.isFinite(pct) && (
          <span className={cn("tabular inline-flex items-center text-[0.6875rem] font-bold", good ? "text-income" : "text-expense")}>
            {change > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(pct).toFixed(1)}%
          </span>
        )}
        <HideAmountsButton className="-my-1 ml-auto size-7" />
      </div>
      <AnimatedMoney minor={headline.value} className="mt-1 block truncate font-money text-[1.75rem] leading-tight font-extrabold tracking-[-0.025em]" />
      <p className="truncate text-xs text-muted-foreground">{headline.caption}</p>
    </div>
  )
}

/** One of Faldo's insights, when there is one. */
function InsightCard() {
  const { data: insights = [], isLoading } = useInsights()
  const insight = insights[0]
  return (
    <section aria-label="Insight" className="card-surface flex min-w-0 flex-col p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps text-primary">Insight</span>
        <Link href="/insights" className="hit inline-flex items-center text-[0.6875rem] font-semibold text-muted-foreground hover:text-foreground">All <ChevronRight className="size-3" /></Link>
      </div>
      {isLoading ? (
        <div className="mt-2 space-y-1.5"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-2/3" /></div>
      ) : insight ? (
        <p className="mt-1.5 line-clamp-4 text-[0.8125rem] leading-snug text-foreground/80">
          <span className="font-bold text-foreground">{maskAmounts(insight.title)}.</span> {maskAmounts(insight.body)}
        </p>
      ) : (
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted-foreground">Nothing to flag right now. Faldo will point out patterns as you log.</p>
      )}
    </section>
  )
}

/** The last seven days of the chosen balance as bars, today in full colour. */
function DailyBalance({ view }: { view: View }) {
  const { data: history, isLoading } = useBalanceHistory(7)
  const currency = useMe().data?.settings.currency
  const points = (history ?? []).slice(-7).map((p) => ({ date: p.date, value: p[HISTORY_KEY[view]] }))
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  return (
    <section aria-label="Daily balance" className="card-surface flex min-w-0 flex-col p-3.5">
      <span className="label-caps">Daily balance</span>
      {points.length >= 2 && (
        <p className={cn("tabular mt-1 text-[0.8125rem] font-semibold", values[values.length - 1] - values[0] < 0 ? "text-foreground" : "text-income")}>
          {formatMoney(values[values.length - 1] - values[0], currency, { signed: true })} <span className="font-normal text-muted-foreground">over 7 days</span>
        </p>
      )}
      {isLoading ? <Skeleton className="mt-3 h-20" /> : points.length < 2 ? (
        <p className="mt-2 text-[0.8125rem] text-muted-foreground">Appears after a few days.</p>
      ) : (
        <ol className="mt-2 flex flex-1 items-end justify-between gap-1">
          {points.map((p, i) => {
            const last = i === points.length - 1
            const height = max === min ? 60 : 28 + ((p.value - min) / (max - min)) * 72
            return (
              <li key={p.date} className="flex flex-1 flex-col items-center gap-1.5" title={`${format(parseISO(p.date), "EEE, MMM d")}: ${formatMoney(p.value, currency)}`}>
                <span className="flex h-16 w-full items-end justify-center">
                  <span className={cn("w-2 rounded-full", last ? "bg-primary" : "bg-primary/25")} style={{ height: `${height}%` }} />
                </span>
                <span className={cn("text-[0.6875rem]", last ? "font-bold text-foreground" : "text-muted-foreground")}>{format(parseISO(p.date), "EEEEE")}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default function AccountsPage() {
  useMaskedAmounts()
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { openAddTransaction } = useAppActions()
  const { data: accounts, isLoading, isError, error, refetch, isFetching } = useAccounts()
  const [dialog, setDialog] = useState<{ open: boolean; account?: Account }>({ open: false })
  const [view, setView] = useState<View>("all")
  const [layout, setLayout] = useState<"grid" | "list">(readView)
  const [filter, setFilter] = useState<AccountType | "all">("all")
  const [collapsed, setCollapsed] = useState<Set<AccountType>>(new Set())
  const [arranging, setArranging] = useState(false)
  const [order, setOrder] = useState<string[]>([])

  const active = useMemo(() => (accounts ?? []).filter((a) => !a.archived), [accounts])
  // A failed load is an error, never "Add your first account": that would tell someone their accounts are gone.
  const listed = listView({ isLoading, isError, hasData: accounts !== undefined, count: active.length })
  const ordered = useMemo(() => {
    if (!arranging) return active
    return order.map((id) => active.find((a) => a.id === id)).filter(Boolean) as Account[]
  }, [active, arranging, order])

  const assets = active.filter((a) => a.balance_minor > 0).reduce((s, a) => s + a.balance_minor, 0)
  const liabilities = active.filter((a) => a.balance_minor < 0).reduce((s, a) => s - a.balance_minor, 0)
  const net = assets - liabilities

  function startArranging() {
    play("select")
    setOrder(active.map((a) => a.id))
    setArranging(true)
  }

  async function finishArranging() {
    setArranging(false)
    try {
      await api.put("/accounts/order", { ids: order })
      await invalidateFinancialData(qc)
      toast.success("Account order saved")
    } catch {
      toast.error("Couldn't save the new order.")
    }
  }

  function move(id: string, direction: -1 | 1) {
    play("tap")
    setOrder((current) => {
      const next = [...current]
      const a = next.indexOf(id)
      const b = a + direction
      if (a < 0 || b < 0 || b >= next.length) return current
      ;[next[a], next[b]] = [next[b], next[a]]
      return next
    })
  }

  function changeLayout(next: "grid" | "list") {
    setLayout(next)
    try { window.localStorage.setItem(VIEW_KEY, next) } catch {}
  }

  const filters = ACCOUNT_GROUPS.filter((g) => active.some((a) => a.type === g.type))
  const inView = (a: Account) => view === "all" || (view === "assets" ? a.balance_minor >= 0 : a.balance_minor < 0)
  const shown = ordered.filter((a) => (filter === "all" || a.type === filter) && inView(a))
  const groups = ACCOUNT_GROUPS
    .filter((g) => filter === "all" || g.type === filter)
    .map((g) => ({ ...g, accounts: ordered.filter((a) => a.type === g.type && inView(a)) }))
    .filter((g) => g.accounts.length > 0)

  const headline = view === "all" ? { label: "Net worth", value: net, caption: "Assets minus what you owe" }
    : view === "assets" ? { label: "Assets", value: assets, caption: "Cash, e-wallets, banks and savings" }
      : { label: "Liabilities", value: liabilities, caption: "What you owe on credit cards" }

  const actions = { onEdit: (a: Account) => setDialog({ open: true, account: a }), onAdd: (a: Account, mode: "expense" | "income" | "transfer") => openAddTransaction({ mode, preset: { account_id: a.id } }) }
  const toggle = (type: AccountType) => setCollapsed((c) => { const n = new Set(c); if (n.has(type)) n.delete(type); else n.add(type); return n })

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 pt-[calc(var(--top-inset)+0.75rem)] lg:pt-10">
        <div className="min-w-0 pt-1">
          <h1 className="page-title lg:text-[2rem]">Wallet</h1>
          <p className="mt-0.5 text-[0.875rem] text-muted-foreground">Cash, e-wallets, banks and cards you track by hand</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {arranging ? (
            <>
              <HeaderButton onClick={() => setArranging(false)}>Cancel</HeaderButton>
              <Button onClick={finishArranging} className="h-10 rounded-full px-4">Done</Button>
            </>
          ) : (
            <>
              <HeaderButton onClick={() => router.push("/import")} aria-label="Import a statement"><FileUp /></HeaderButton>
              {active.length > 1 && <HeaderButton onClick={startArranging} aria-label="Reorder accounts"><ArrowUpDown /></HeaderButton>}
              <HeaderButton onClick={() => setDialog({ open: true })} aria-label="Add an account"><Plus /></HeaderButton>
            </>
          )}
        </div>
      </header>

      {isLoading ? <Skeleton className="h-36 rounded-[1.5rem]" /> : active.length > 0 && (
        <section aria-label="Net worth" className="relative -mx-5 overflow-hidden sm:-mx-6 lg:mx-0 lg:rounded-[1.5rem]">
          <div aria-hidden className="absolute inset-x-0 top-10 bottom-0 bg-hero" />
          <div className="relative flex items-end gap-2 px-4 pb-4 sm:px-6 lg:max-w-2xl">
            <Panda pose={poseFor(me?.settings.mascot_outfit)} sizes="120px"
              className="pointer-events-none -mb-6 -ml-1 w-[6.5rem] shrink-0 drop-shadow-[0_10px_16px_rgb(0_0_0/0.2)] min-[390px]:w-[7.25rem]" />
            <div className="min-w-0 flex-1">
              <NetWorthCard view={view} headline={headline} />
              <div className="mt-2.5 flex gap-1.5" role="radiogroup" aria-label="Balance view">
                {VIEWS.map((v) => (
                  <button key={v.value} type="button" role="radio" aria-checked={view === v.value} onClick={() => { play("select"); setView(v.value) }}
                    className={cn("pressable hit h-9 min-w-0 flex-1 rounded-[0.75rem] px-1.5 text-[0.8125rem] font-semibold transition-colors",
                      view === v.value ? "bg-card text-primary shadow-[0_2px_8px_-2px_rgb(0_0_0/0.3)]" : "bg-white/15 text-white hover:bg-white/25")}>
                    <span className="block truncate">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {listed === "loading" ? (
        <div className="space-y-4"><div className="grid grid-cols-[1.4fr_1fr] gap-3"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div><div className="grid grid-cols-2 gap-2.5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[1.45] rounded-[1.125rem]" />)}</div></div>
      ) : listed === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">
          <span className="flex-1">Couldn&apos;t load your accounts, so balances aren&apos;t shown. {error?.message}</span>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching && <Loader2 className="animate-spin" />} Try again
          </Button>
        </div>
      ) : active.length === 0 ? (
        <div className="card-surface">
          <EmptyState icon={Wallet} title="Add your first account" description="Start with where your money lives: cash, GCash, Maya or a bank account. Faldo never connects to your bank."
            action={<Button size="lg" onClick={() => setDialog({ open: true })}><Plus /> Add account</Button>} />
        </div>
      ) : arranging ? (
        <section aria-label="Reorder accounts" className="space-y-2.5">
          <p className="text-[0.8125rem] text-muted-foreground">Move accounts up or down, then tap Done. Home shows them in this order.</p>
          <ol className="ios-group divide-y divide-border/60">
            {ordered.map((account, i) => (
              <li key={account.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
                <AccountBadge account={account} index={active.indexOf(account)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold">{account.name}</span>
                  <span className="block truncate text-[0.8125rem] text-muted-foreground">{account.institution ?? ACCOUNT_GROUPS.find((g) => g.type === account.type)?.label}</span>
                </span>
                <button type="button" disabled={i === 0} onClick={() => move(account.id, -1)} aria-label={`Move ${account.name} up`}
                  className="pressable flex size-10 items-center justify-center rounded-full text-foreground hover:bg-accent disabled:opacity-25"><ChevronUp className="size-5" /></button>
                <button type="button" disabled={i === ordered.length - 1} onClick={() => move(account.id, 1)} aria-label={`Move ${account.name} down`}
                  className="pressable flex size-10 items-center justify-center rounded-full text-foreground hover:bg-accent disabled:opacity-25"><ChevronDown className="size-5" /></button>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <>
          <div className="cascade grid grid-cols-[1.4fr_1fr] gap-3 lg:grid-cols-[2fr_1fr]">
            <InsightCard />
            <DailyBalance view={view} />
          </div>

          <div className="space-y-2.5">
            {filters.length > 1 && (
              <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
                {filters.map((f) => <Chip key={f.type} active={filter === f.type} onClick={() => setFilter(f.type)}>{f.label}</Chip>)}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[0.8125rem] text-muted-foreground">{shown.length} {shown.length === 1 ? "account" : "accounts"}, tap one for its history</p>
              <div className="flex shrink-0 rounded-full bg-muted p-1" role="radiogroup" aria-label="Layout">
                <button type="button" role="radio" aria-label="Card view" aria-checked={layout === "grid"} onClick={() => changeLayout("grid")}
                  className={cn("flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors", layout === "grid" && "bg-card text-primary shadow-[0_1px_3px_rgb(16_36_24/0.1)] dark:bg-accent")}><LayoutGrid className="size-3.5" /></button>
                <button type="button" role="radio" aria-label="List view" aria-checked={layout === "list"} onClick={() => changeLayout("list")}
                  className={cn("flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors", layout === "list" && "bg-card text-primary shadow-[0_1px_3px_rgb(16_36_24/0.1)] dark:bg-accent")}><List className="size-3.5" /></button>
              </div>
            </div>
          </div>

          {/* On desktop the groups sit side by side as columns, so a type with one account doesn't leave a row empty. */}
          <div className="cascade space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6 lg:gap-y-8 lg:space-y-0 xl:grid-cols-4">
            {groups.map((group) => {
              const total = group.accounts.reduce((s, a) => s + a.balance_minor, 0)
              const isCollapsed = collapsed.has(group.type)
              return (
                <section key={group.type} className="space-y-3">
                  <button type="button" aria-expanded={!isCollapsed} onClick={() => toggle(group.type)} className="flex w-full items-center gap-1.5 rounded-md text-left">
                    <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isCollapsed && "-rotate-90")} />
                    <span className="section-title flex-1">{group.label}</span>
                    <span className={cn("tabular text-[0.875rem] font-bold", total < 0 ? "text-expense" : "text-muted-foreground")}>{formatMoney(total)}</span>
                  </button>
                  {!isCollapsed && (layout === "grid" ? (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-1">
                      {group.accounts.map((account) => <AccountTile key={account.id} account={account} index={active.indexOf(account)} actions={actions} />)}
                    </div>
                  ) : (
                    <div className="ios-group divide-y divide-border/60">
                      {group.accounts.map((account) => (
                        <Link key={account.id} href={`/accounts/${account.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                          <AccountBadge account={account} index={active.indexOf(account)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem] font-semibold">{account.name}{account.card_last4 && <span className="tabular ml-1.5 text-[0.8125rem] font-normal text-muted-foreground">•••• {account.card_last4}</span>}</span>
                            <span className="block truncate text-[0.8125rem] text-muted-foreground">{account.institution ?? group.label}, {account.transaction_count} {account.transaction_count === 1 ? "transaction" : "transactions"}</span>
                          </span>
                          <span className={cn("tabular text-[0.9375rem] font-bold", account.balance_minor < 0 && "text-expense")}>{formatMoney(account.balance_minor, account.currency)}</span>
                          <ChevronRight className="size-4 text-muted-foreground/50" />
                        </Link>
                      ))}
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        </>
      )}
      {dialog.open && <AccountDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} account={dialog.account} />}
    </div>
  )
}
