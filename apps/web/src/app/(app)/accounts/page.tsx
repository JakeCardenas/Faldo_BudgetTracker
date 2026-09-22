"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { ArrowDownRight, ArrowUpRight, ArrowUpDown, ChevronDown, ChevronRight, ChevronUp, FileUp, LayoutGrid, List, Plus, Wallet } from "lucide-react"
import { toast } from "sonner"
import { BambooDecor, environmentStyle } from "@/components/brand/environment"
import { Panda } from "@/components/brand/panda"
import { StatusBarTint } from "@/components/brand/status-bar-tint"
import { AccountDialog } from "@/components/finance/account-dialog"
import { EmptyState } from "@/components/finance/empty-state"
import { HideAmountsButton } from "@/components/finance/hide-amounts"
import { AnimatedMoney } from "@/components/finance/money"
import { Chip } from "@/components/ios/segmented"
import { useAppActions } from "@/components/layout/app-context"
import { AccountBadge, AccountTile } from "@/components/wallet/account-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ACCOUNT_GROUPS } from "@/lib/account-templates"
import { api } from "@/lib/api"
import { environmentFor, poseFor } from "@/lib/catalog"
import { formatMoney } from "@/lib/format"
import { maskAmounts } from "@/lib/privacy"
import { invalidateFinancialData, useAccounts, useBalanceHistory, useInsights, useMe } from "@/lib/queries"
import type { Account, AccountType } from "@/lib/types"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

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

const bandButton = "glass-on-green pressable flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white [&_svg]:size-[1.15rem]"

/** The headline figure for the chosen view, with how it moved over the past month. */
function NetWorthCard({ view, headline }: { view: View; headline: { label: string; value: number; caption: string } }) {
  const { data: history } = useBalanceHistory(30)
  const first = history?.[0]?.[HISTORY_KEY[view]]
  const change = first !== undefined ? headline.value - first : null
  const pct = first ? ((change ?? 0) / Math.abs(first)) * 100 : null
  const good = change !== null && (view === "liabilities" ? change <= 0 : change >= 0)
  return (
    <div className="min-w-0 flex-1 rounded-[1.25rem] bg-card p-4 text-card-foreground shadow-[0_18px_36px_-18px_rgb(0_0_0/0.45)]">
      <div className="flex items-center gap-1.5">
        <span className="label-caps">{headline.label}</span>
        {change !== null && change !== 0 && pct !== null && Number.isFinite(pct) && (
          <span className={cn("tabular inline-flex items-center text-[0.6875rem] font-bold", good ? "text-income" : "text-expense")}>
            {change > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(pct).toFixed(1)}%
          </span>
        )}
        <HideAmountsButton className="-my-1 ml-auto size-7" />
      </div>
      <AnimatedMoney minor={headline.value} className="mt-1 block truncate text-[1.75rem] leading-tight font-extrabold tracking-[-0.04em]" />
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
        <Link href="/insights" className="inline-flex items-center text-[0.6875rem] font-semibold text-muted-foreground hover:text-foreground">All <ChevronRight className="size-3" /></Link>
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
  const points = (history ?? []).slice(-7).map((p) => ({ date: p.date, value: p[HISTORY_KEY[view]] }))
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  return (
    <section aria-label="Daily balance" className="card-surface flex min-w-0 flex-col p-3.5">
      <span className="label-caps">Daily balance</span>
      {isLoading ? <Skeleton className="mt-3 h-20" /> : points.length < 2 ? (
        <p className="mt-2 text-[0.8125rem] text-muted-foreground">Appears after a few days.</p>
      ) : (
        <ol className="mt-3 flex flex-1 items-end justify-between gap-1">
          {points.map((p, i) => {
            const last = i === points.length - 1
            const height = max === min ? 60 : 28 + ((p.value - min) / (max - min)) * 72
            return (
              <li key={p.date} className="flex flex-1 flex-col items-center gap-1.5" title={`${format(parseISO(p.date), "EEE, MMM d")}: ${formatMoney(p.value)}`}>
                <span className="flex h-16 w-full items-end justify-center">
                  <span className={cn("w-2 rounded-full", last ? "bg-primary" : "bg-primary/25")} style={{ height: `${height}%` }} />
                </span>
                <span className={cn("text-[0.625rem]", last ? "font-bold text-foreground" : "text-muted-foreground")}>{format(parseISO(p.date), "EEEEE")}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default function AccountsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { openAddTransaction } = useAppActions()
  const { data: accounts, isLoading } = useAccounts()
  const [dialog, setDialog] = useState<{ open: boolean; account?: Account }>({ open: false })
  const [view, setView] = useState<View>("all")
  const [layout, setLayout] = useState<"grid" | "list">(readView)
  const [filter, setFilter] = useState<AccountType | "all">("all")
  const [collapsed, setCollapsed] = useState<Set<AccountType>>(new Set())
  const [arranging, setArranging] = useState(false)
  const [order, setOrder] = useState<string[]>([])

  const active = useMemo(() => (accounts ?? []).filter((a) => !a.archived), [accounts])
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
    <div className="space-y-6 pb-2">
      <section data-band aria-label="Wallet" style={environmentStyle(me?.settings.home_background)}
        className="relative isolate -mx-5 overflow-hidden px-5 pt-[calc(var(--top-inset)+0.625rem)] text-white sm:-mx-6 sm:px-7 lg:mx-0 lg:mt-7 lg:rounded-[2rem] lg:px-10 lg:pt-8">
        <StatusBarTint color={`color-mix(in oklab, ${environmentFor(me?.settings.home_background).from} 88%, ${environmentFor(me?.settings.home_background).to})`} />
        <BambooDecor className="absolute top-0 -right-8 -z-10 h-[18rem] lg:h-[24rem]" />
        <div className="flex items-center justify-between gap-2">
          {arranging ? <span /> : (
            <button type="button" onClick={() => router.push("/import")} aria-label="Import a statement" className={bandButton}><FileUp /></button>
          )}
          <div className="flex gap-2">
            {arranging ? (
              <>
                <button type="button" onClick={() => setArranging(false)} className={bandButton}>Cancel</button>
                <button type="button" onClick={finishArranging} className="pressable flex h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-[#17462c]">Done</button>
              </>
            ) : (
              <>
                {active.length > 1 && <button type="button" onClick={startArranging} aria-label="Reorder accounts" className={bandButton}><ArrowUpDown /></button>}
                <button type="button" onClick={() => setDialog({ open: true })} aria-label="Add an account" className={bandButton}><Plus /></button>
              </>
            )}
          </div>
        </div>
        <h1 className="mt-4 text-[1.625rem] leading-tight font-extrabold tracking-[-0.03em] lg:text-[2rem]">Wallet</h1>
        <p className="mt-0.5 text-[0.8125rem] text-white/75">Cash, e-wallets, banks and cards you track by hand</p>

        {isLoading ? <Skeleton className="mt-4 mb-5 ml-28 h-24 rounded-[1.25rem] bg-white/15" /> : active.length > 0 && (
          <>
            <div className="mt-3 flex items-end gap-2 lg:max-w-xl">
              <Panda pose={poseFor(me?.settings.mascot_outfit)} sizes="120px"
                className="pointer-events-none -mb-3 -ml-2 w-[6.75rem] shrink-0 self-end drop-shadow-[0_12px_18px_rgb(0_0_0/0.22)] min-[390px]:w-[7.5rem]" />
              <div className="min-w-0 flex-1 pb-4">
                <NetWorthCard view={view} headline={headline} />
                <div className="mt-2.5 flex gap-1.5" role="radiogroup" aria-label="Balance view">
                  {VIEWS.map((v) => (
                    <button key={v.value} type="button" role="radio" aria-checked={view === v.value} onClick={() => { play("select"); setView(v.value) }}
                      className={cn("h-8 min-w-0 flex-1 truncate rounded-full px-1.5 text-[0.75rem] font-bold transition-colors",
                        view === v.value ? "bg-white text-[#17462c] shadow-[0_2px_8px_-2px_rgb(0_0_0/0.35)]" : "glass-on-green text-white hover:bg-white/20")}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {isLoading ? (
        <div className="space-y-4"><div className="grid grid-cols-[1.4fr_1fr] gap-3"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div><div className="grid grid-cols-2 gap-2.5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[1.45] rounded-[1.125rem]" />)}</div></div>
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
                  className={cn("flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors", layout === "grid" && "bg-card text-primary shadow-[0_1px_3px_rgb(16_36_24/0.1)] dark:bg-[#2b302c]")}><LayoutGrid className="size-3.5" /></button>
                <button type="button" role="radio" aria-label="List view" aria-checked={layout === "list"} onClick={() => changeLayout("list")}
                  className={cn("flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors", layout === "list" && "bg-card text-primary shadow-[0_1px_3px_rgb(16_36_24/0.1)] dark:bg-[#2b302c]")}><List className="size-3.5" /></button>
              </div>
            </div>
          </div>

          <div className="cascade space-y-6">
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
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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
