"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, LayoutGrid, List, Lightbulb, Plus, Wallet } from "lucide-react"
import { toast } from "sonner"
import { AccountDialog } from "@/components/finance/account-dialog"
import { EmptyState } from "@/components/finance/empty-state"
import { AnimatedMoney } from "@/components/finance/money"
import { Chip, Segmented } from "@/components/ios/segmented"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { useAppActions } from "@/components/layout/app-context"
import { AccountBadge, AccountCard } from "@/components/wallet/account-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ACCOUNT_GROUPS } from "@/lib/account-templates"
import { api } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useBalanceHistory, useInsights } from "@/lib/queries"
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
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">Daily balance</p>
      {isLoading ? <Skeleton className="mt-2 h-16" /> : (
        <div className="mt-2 flex h-16 items-end gap-1.5">
          {history?.map((p, i) => {
            const last = i === history.length - 1
            const height = max === min ? 60 : 25 + ((p.net_minor - min) / (max - min)) * 75
            return (
              <div key={p.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${format(parseISO(p.date), "EEE, MMM d")}: ${formatMoney(p.net_minor)}`}>
                <div className={cn("w-full max-w-4 rounded-[3px]", last ? "bg-primary" : "bg-foreground/12 dark:bg-foreground/15")} style={{ height: `${height}%` }} />
                <span className={cn("text-[0.625rem]", last ? "font-semibold text-foreground" : "text-muted-foreground")}>{format(parseISO(p.date), "EEEEE")}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InsightRow({ assets }: { assets: number }) {
  const { data: insights = [] } = useInsights()
  const insight = insights[0]
  const fallback = assets >= 50_000_00
    ? "That's a healthy cushion of liquid money. Keep a slice parked in savings so it stays that way."
    : "Every peso you track makes the forecast sharper. Log today's spending to keep the picture clear."
  return (
    <Link href="/forecast" className="group flex items-start gap-3 border-t px-4 py-3.5 transition-colors hover:bg-accent/50 sm:px-5">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.85} />
      <p className="min-w-0 flex-1 text-sm leading-relaxed"><span className="line-clamp-2">{insight ? <><span className="font-medium">{insight.title}.</span> <span className="text-muted-foreground">{insight.body}</span></> : fallback}</span></p>
      <span className="hidden shrink-0 items-center gap-0.5 text-[0.8125rem] font-medium text-primary sm:flex">Forecast <ChevronRight className="size-3.5" /></span>
    </Link>
  )
}

export default function AccountsPage() {
  const qc = useQueryClient()
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
    play("select")
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
    play("tap")
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
      <LargeTitle title="Wallet" subtitle="Your accounts and balances"
        actions={arranging
          ? <Button size="sm" onClick={finishArranging}>Done</Button>
          : <HeaderButton onClick={() => setDialog({ open: true })}><Plus /> Add account</HeaderButton>} />

      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-52 rounded-xl" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-34 rounded-xl" />)}</div></div>
      ) : active.length === 0 ? (
        <div className="card-surface">
          <EmptyState icon={Wallet} title="Add your first wallet" description="Start with where your money lives: cash, GCash, Maya or a bank account."
            action={<Button size="lg" onClick={() => setDialog({ open: true })}><Plus /> Add account</Button>} />
        </div>
      ) : (
        <>
          <section className="card-surface overflow-hidden">
            <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 md:grid-cols-[1fr_15rem] md:items-end">
              <div className="min-w-0">
                <Segmented label="Balance view" size="sm" value={view} onChange={setView}
                  options={[{ value: "all", label: "Net worth" }, { value: "assets", label: "Assets" }, { value: "liabilities", label: "Liabilities" }]} />
                <AnimatedMoney minor={headline.value} className="display-number mt-5 block sm:text-[2.75rem]" />
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted-foreground">
                  {view === "all" && trend !== null && Number.isFinite(trend) && (
                    <span className={cn("inline-flex items-center font-medium", trend >= 0 ? "text-income" : "text-foreground")}>
                      {trend >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{Math.abs(trend).toFixed(1)}% this month,
                    </span>
                  )}
                  {headline.caption}
                </p>
              </div>
              <DailyBalance />
            </div>
            <InsightRow assets={assets} />
          </section>

          <div className="flex items-center gap-2">
            {filters.length > 1 ? (
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
                <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
                {filters.map((f) => <Chip key={f.type} active={filter === f.type} onClick={() => setFilter(f.type)}>{f.label}</Chip>)}
              </div>
            ) : <div className="flex-1" />}
            {!arranging && (
              <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={startArranging}>Reorder</Button>
            )}
            <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Layout">
              <button type="button" role="radio" aria-label="Grid view" aria-checked={layout === "grid"} onClick={() => changeLayout("grid")}
                className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors", layout === "grid" && "bg-card text-foreground shadow-[0_1px_2px_rgb(15_20_17/0.08)] dark:bg-[#2b302c]")}><LayoutGrid className="size-3.5" /></button>
              <button type="button" role="radio" aria-label="List view" aria-checked={layout === "list"} onClick={() => changeLayout("list")}
                className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors", layout === "list" && "bg-card text-foreground shadow-[0_1px_2px_rgb(15_20_17/0.08)] dark:bg-[#2b302c]")}><List className="size-3.5" /></button>
            </div>
          </div>
          {arranging && <p className="-mt-2 text-[0.8125rem] text-muted-foreground">Use the arrows to reorder, then tap Done.</p>}

          <div className="space-y-6">
            {groups.map((group) => {
              const total = group.accounts.reduce((s, a) => s + a.balance_minor, 0)
              const isCollapsed = collapsed.has(group.type)
              const ids = group.accounts.map((a) => a.id)
              return (
                <section key={group.type} className="space-y-2.5">
                  <button type="button" aria-expanded={!isCollapsed} onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(group.type)) n.delete(group.type); else n.add(group.type); return n })}
                    className="flex w-full items-center gap-1.5 rounded-md px-1 text-left">
                    <span className="section-title flex-1">{group.label}</span>
                    <span className={cn("tabular text-[0.8125rem] font-medium", total < 0 ? "text-expense" : "text-muted-foreground")}>{formatMoney(total)}</span>
                    <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isCollapsed && "-rotate-90")} />
                  </button>
                  {!isCollapsed && (layout === "grid" || arranging ? (
                    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-3", arranging && "gap-y-7 pb-3")}>
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
                        <Link key={account.id} href={`/accounts/${account.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                          <AccountBadge account={account} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem]">{account.name}</span>
                            <span className="block truncate text-[0.8125rem] text-muted-foreground">{account.institution ?? group.label}, {account.transaction_count} transactions</span>
                          </span>
                          <span className={cn("tabular text-[0.9375rem] font-medium", account.balance_minor < 0 && "text-expense")}>{formatMoney(account.balance_minor, account.currency)}</span>
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
