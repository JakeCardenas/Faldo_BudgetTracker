"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { ChevronDown, ChevronRight, LayoutGrid, List, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Mascot } from "@/components/brand/mascot"
import { Scene } from "@/components/brand/scene"
import { AccountDialog } from "@/components/finance/account-dialog"
import { EmptyState } from "@/components/finance/empty-state"
import { AnimatedMoney } from "@/components/finance/money"
import { Chip } from "@/components/ios/segmented"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { useAppActions } from "@/components/layout/app-context"
import { AccountBadge, AccountCard } from "@/components/wallet/account-card"
import { Skeleton } from "@/components/ui/skeleton"
import { ACCOUNT_GROUPS } from "@/lib/account-templates"
import { api } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useBalanceHistory, useInsights, useMe } from "@/lib/queries"
import type { Account, AccountType } from "@/lib/types"
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

function useLongPress(onLongPress: () => void, ms = 480) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  return {
    onPointerDown: () => { fired.current = false; clear(); timer.current = setTimeout(() => { fired.current = true; onLongPress(); navigator.vibrate?.(12) }, ms) },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault() },
    onClickCapture: (e: React.MouseEvent) => { if (fired.current) { e.preventDefault(); e.stopPropagation() } },
  }
}

function DailyBalance() {
  const { data: history, isLoading } = useBalanceHistory(6)
  const values = history?.map((p) => p.net_minor) ?? []
  const min = Math.min(...values)
  const max = Math.max(...values)
  return (
    <div className="card-surface flex flex-col p-4">
      <p className="eyebrow">Daily balance</p>
      {isLoading ? <Skeleton className="mt-3 h-16 rounded-xl" /> : (
        <div className="mt-3 flex h-16 flex-1 items-end gap-1.5">
          {history?.map((p, i) => {
            const last = i === history.length - 1
            const height = max === min ? 60 : 25 + ((p.net_minor - min) / (max - min)) * 75
            return (
              <div key={p.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${format(parseISO(p.date), "EEE, MMM d")}: ${formatMoney(p.net_minor)}`}>
                <div className={cn("w-full max-w-3 rounded-full", last ? "bg-primary" : "bg-leaf/50")} style={{ height: `${height}%` }} />
                <span className={cn("text-[0.6rem] font-bold", last ? "text-foreground" : "text-muted-foreground")}>{format(parseISO(p.date), "EEEEE")}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InsightCard({ assets }: { assets: number }) {
  const { data: insights = [] } = useInsights()
  const insight = insights[0]
  const fallback = assets >= 50_000_00
    ? "That's a healthy cushion of liquid money. Keep a slice parked in savings so it stays that way."
    : "Every peso you track makes the forecast sharper. Log today's spending to keep the picture clear."
  return (
    <Link href="/forecast" className="card-surface pressable relative flex flex-col overflow-hidden p-4">
      <span className="pointer-events-none absolute -top-2 left-2 font-serif text-6xl leading-none text-primary/10" aria-hidden>“</span>
      <div className="relative flex items-center justify-between gap-2">
        <p className="eyebrow text-primary">Insight</p>
        <span className="flex items-center gap-0.5 text-[0.7rem] font-bold text-muted-foreground">Forecast cashflow <ChevronRight className="size-3" /></span>
      </div>
      <p className="relative mt-2 line-clamp-3 text-sm leading-snug">{insight ? <><span className="font-bold">{insight.title}.</span> {insight.body}</> : fallback}</p>
    </Link>
  )
}

export default function AccountsPage() {
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
  const { data: history } = useBalanceHistory(30)
  const monthAgo = history?.[0]?.net_minor
  const trend = monthAgo ? ((net - monthAgo) / Math.abs(monthAgo)) * 100 : null

  function startArranging() {
    setOrder(active.map((a) => a.id))
    setArranging(true)
  }
  const longPress = useLongPress(startArranging)

  async function finishArranging() {
    setArranging(false)
    try {
      await api.put("/accounts/order", { ids: order })
      await invalidateFinancialData(qc)
      toast.success("Wallet order saved")
    } catch {
      toast.error("Couldn't save the new order.")
    }
  }

  function move(id: string, direction: -1 | 1, groupIds: string[]) {
    const index = groupIds.indexOf(id)
    const target = groupIds[index + direction]
    if (!target) return
    setOrder((current) => {
      const next = [...current]
      const a = next.indexOf(id)
      const b = next.indexOf(target)
      ;[next[a], next[b]] = [next[b], next[a]]
      return next
    })
  }

  function changeLayout(next: "grid" | "list") {
    setLayout(next)
    try { window.localStorage.setItem(VIEW_KEY, next) } catch {}
  }

  const filters = ACCOUNT_GROUPS.filter((g) => active.some((a) => a.type === g.type))
  const groups = ACCOUNT_GROUPS
    .filter((g) => filter === "all" || g.type === filter)
    .map((g) => ({ ...g, accounts: ordered.filter((a) => a.type === g.type && (view === "all" || (view === "assets" ? a.balance_minor >= 0 : a.balance_minor < 0))) }))
    .filter((g) => g.accounts.length > 0)

  const headline = view === "all" ? { label: "Net worth", value: net, caption: "Assets minus liabilities" }
    : view === "assets" ? { label: "Assets", value: assets, caption: "Accounts and receivables" }
      : { label: "Liabilities", value: liabilities, caption: "Credit cards and money owed" }

  return (
    <div className="space-y-5">
      <LargeTitle title="Accounts" subtitle="Manage your wallets and balances"
        actions={arranging
          ? <HeaderButton onClick={finishArranging} className="bg-primary text-primary-foreground hover:bg-primary">Done</HeaderButton>
          : <HeaderButton onClick={() => setDialog({ open: true })} className="text-primary"><Plus className="size-4" /> Add Account</HeaderButton>} />

      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-44 rounded-[1.75rem]" /><div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-[1.4rem]" />)}</div></div>
      ) : active.length === 0 ? (
        <div className="card-surface">
          <EmptyState icon={Wallet} title="Add your first wallet" description="Start with where your money lives: cash, GCash, Maya or a bank account."
            action={<button type="button" onClick={() => setDialog({ open: true })} className="pressable flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"><Plus className="size-4" /> Add account</button>} />
        </div>
      ) : (
        <>
          <section>
            <div className="relative -mx-4 sm:mx-0">
              <div className="absolute inset-x-0 bottom-6 h-[58%] overflow-hidden sm:rounded-[1.75rem]"><Scene id={me?.settings.home_background ?? "meadow"} /></div>
              <div className="relative flex items-end gap-2 px-3 sm:px-5">
                <Mascot outfit={me?.settings.mascot_outfit} className="animate-bob mb-7 w-24 shrink-0 drop-shadow-md sm:w-32" />
                <div className="mb-3 min-w-0 flex-1 rounded-[1.4rem] border bg-card p-4 shadow-(--shadow-float) sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="eyebrow">{headline.label}</p>
                    {view === "all" && trend !== null && Number.isFinite(trend) && (
                      <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", trend >= 0 ? "text-income" : "text-expense")}>
                        {trend >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{Math.abs(trend).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <AnimatedMoney minor={headline.value} className="mt-1 block text-[1.85rem] leading-tight font-extrabold tracking-tight sm:text-4xl" />
                  <p className="text-xs text-muted-foreground">{headline.caption}</p>
                </div>
              </div>
              <div className="relative flex gap-2 px-4 sm:px-5">
                {(["all", "assets", "liabilities"] as View[]).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                    className={cn("pressable h-9 flex-1 rounded-full border text-sm font-bold capitalize shadow-(--shadow-card) transition-colors",
                      view === v ? "border-primary bg-card text-primary ring-2 ring-primary/30" : "bg-card text-foreground")}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-[1.6fr_1fr] gap-3">
            <InsightCard assets={assets} />
            <DailyBalance />
          </div>

          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-xs text-muted-foreground">{arranging ? "Use the arrows to reorder, then tap Done." : "Press and hold an account card to rearrange it."}</p>
            <div className="flex shrink-0 rounded-full bg-muted p-1">
              <button type="button" aria-label="Grid view" aria-pressed={layout === "grid"} onClick={() => changeLayout("grid")}
                className={cn("flex size-7 items-center justify-center rounded-full", layout === "grid" && "bg-card shadow-(--shadow-card)")}><LayoutGrid className="size-3.5" /></button>
              <button type="button" aria-label="List view" aria-pressed={layout === "list"} onClick={() => changeLayout("list")}
                className={cn("flex size-7 items-center justify-center rounded-full", layout === "list" && "bg-card shadow-(--shadow-card)")}><List className="size-3.5" /></button>
            </div>
          </div>

          {filters.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
              {filters.map((f) => <Chip key={f.type} active={filter === f.type} onClick={() => setFilter(f.type)}>{f.label}</Chip>)}
            </div>
          )}

          <div className="space-y-5">
            {groups.map((group) => {
              const total = group.accounts.reduce((s, a) => s + a.balance_minor, 0)
              const isCollapsed = collapsed.has(group.type)
              const ids = group.accounts.map((a) => a.id)
              return (
                <section key={group.type} className="space-y-3">
                  <button type="button" aria-expanded={!isCollapsed} onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(group.type)) n.delete(group.type); else n.add(group.type); return n })}
                    className="flex w-full items-center gap-1.5 px-1 text-left">
                    <ChevronDown className={cn("size-4 transition-transform", isCollapsed && "-rotate-90")} />
                    <span className="flex-1 text-base font-extrabold tracking-tight">{group.label}</span>
                    <span className={cn("tabular text-sm font-bold", total < 0 ? "text-expense" : "text-muted-foreground")}>{formatMoney(total)}</span>
                  </button>
                  {!isCollapsed && (layout === "grid" || arranging ? (
                    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-3", arranging && "gap-y-6 pb-2")}>
                      {group.accounts.map((account) => (
                        <AccountCard key={account.id} account={account} index={active.indexOf(account)} jiggle={arranging}
                          pressHandlers={arranging ? undefined : longPress}
                          onMove={(d) => move(account.id, d, ids)} canMoveBack={ids.indexOf(account.id) > 0} canMoveForward={ids.indexOf(account.id) < ids.length - 1}
                          actions={{ onEdit: (a) => setDialog({ open: true, account: a }), onAdd: (a, mode) => openAddTransaction({ mode, preset: { account_id: a.id } }) }} />
                      ))}
                    </div>
                  ) : (
                    <div className="ios-group divide-y divide-border/60">
                      {group.accounts.map((account) => (
                        <Link key={account.id} href={`/accounts/${account.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
                          <AccountBadge account={account} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.95rem] font-bold">{account.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{account.institution ?? group.label} · {account.transaction_count} transactions</span>
                          </span>
                          <span className={cn("tabular text-sm font-extrabold", account.balance_minor < 0 && "text-expense")}>{formatMoney(account.balance_minor, account.currency)}</span>
                          <ChevronRight className="size-4 text-muted-foreground/60" />
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
