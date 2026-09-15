"use client"

import Link from "next/link"
import { use, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { Archive, ArrowLeftRight, ChevronLeft, Loader2, Minus, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { AccountDialog } from "@/components/finance/account-dialog"
import { DayGroups } from "@/components/finance/day-groups"
import { EmptyState } from "@/components/finance/empty-state"
import { Segmented } from "@/components/ios/segmented"
import { useAppActions } from "@/components/layout/app-context"
import { AccountCard } from "@/components/wallet/account-card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate, formatMoney } from "@/lib/format"
import { invalidateFinancialData, useAccounts } from "@/lib/queries"
import type { TransactionList } from "@/lib/types"

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const { openTransaction, openAddTransaction } = useAppActions()
  const [editing, setEditing] = useState(false)
  const [days, setDays] = useState<"30" | "90" | "365">("90")
  const { data: accounts, isLoading } = useAccounts(true)
  const account = accounts?.find((a) => a.id === id)
  const { data: history } = useQuery({
    queryKey: ["account-history", id, days],
    queryFn: () => api.get<{ date: string; balance_minor: number }[]>(`/accounts/${id}/history`, { days }),
  })
  const list = useInfiniteQuery({
    queryKey: ["transactions", "account", id],
    queryFn: ({ pageParam }) => api.get<TransactionList>("/transactions", { account_id: [id], limit: 30, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
  const items = list.data?.pages.flatMap((p) => p.items) ?? []

  if (isLoading) return <div className="space-y-4 pt-16"><Skeleton className="h-48 rounded-[1.4rem]" /><Skeleton className="h-80 rounded-[1.5rem]" /></div>
  if (!account) return <EmptyState icon={Archive} title="Account not found" action={<Link href="/accounts" className="text-sm font-bold text-primary">Back to wallet</Link>} />

  async function toggleArchive() {
    await api.patch(`/accounts/${id}`, { archived: !account!.archived })
    await invalidateFinancialData(qc)
    toast.success(account!.archived ? "Account restored" : "Account archived")
  }

  return (
    <div className="space-y-5">
      <div className="glass sticky top-0 z-30 -mx-4 flex h-14 items-center gap-2 px-4 pt-safe sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-4 lg:backdrop-blur-none">
        <Link href="/accounts" aria-label="Back to wallet" className="pressable flex size-10 items-center justify-center rounded-full border bg-card text-primary shadow-(--shadow-card)">
          <ChevronLeft className="size-5" />
        </Link>
        <p className="flex-1 truncate text-center text-[0.95rem] font-bold lg:text-left lg:text-xl lg:font-extrabold">{account.name}</p>
        <button type="button" onClick={toggleArchive} aria-label={account.archived ? "Restore account" : "Archive account"}
          className="pressable flex size-10 items-center justify-center rounded-full border bg-card text-expense shadow-(--shadow-card)"><Archive className="size-4" /></button>
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit account"
          className="pressable flex size-10 items-center justify-center rounded-full border bg-card text-primary shadow-(--shadow-card)"><Pencil className="size-4" /></button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-20">
          <AccountCard account={account} large />
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => openAddTransaction({ mode: "transfer", preset: { account_id: id } })}
              className="pressable flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-secondary text-sm font-bold text-secondary-foreground"><ArrowLeftRight className="size-4" /> Transfer</button>
            <button type="button" onClick={() => openAddTransaction({ mode: "expense", preset: { account_id: id } })}
              className="pressable flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-expense-soft text-sm font-bold text-expense"><Minus className="size-4" /> Expense</button>
            <button type="button" onClick={() => openAddTransaction({ mode: "income", preset: { account_id: id } })}
              className="pressable flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-income-soft text-sm font-bold text-income"><Plus className="size-4" /> Income</button>
          </div>
          <section className="card-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Balance trend</p>
              <Segmented label="Range" size="sm" value={days} onChange={setDays}
                options={[{ value: "30", label: "30D" }, { value: "90", label: "90D" }, { value: "365", label: "1Y" }]} />
            </div>
            {history ? (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={history} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
                  <defs><linearGradient id="acc-trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="date" hide />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} labelFormatter={(d) => formatDate(String(d))}
                    contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
                  <Area dataKey="balance_minor" name="Balance" stroke="var(--primary)" strokeWidth={2.2} fill="url(#acc-trend)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Skeleton className="mt-3 h-[150px] rounded-xl" />}
            <p className="text-xs text-muted-foreground">{account.transaction_count} transactions · last activity {account.last_activity_on ? formatDate(account.last_activity_on, "MMM d") : "—"}</p>
          </section>
        </div>

        <div className="min-w-0 space-y-3">
          <h2 className="px-1 text-lg font-extrabold tracking-tight">History</h2>
          {list.isLoading ? <Skeleton className="h-64 rounded-[1.25rem]" /> : items.length === 0 ? (
            <p className="card-surface px-4 py-10 text-center text-sm text-muted-foreground">No transactions in this account yet.</p>
          ) : (
            <>
              <DayGroups items={items} onOpen={openTransaction} stickyTop="top-[calc(3.5rem+env(safe-area-inset-top))] lg:top-16" />
              {list.hasNextPage && (
                <button type="button" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}
                  className="pressable mx-auto flex h-10 items-center gap-2 rounded-full border bg-card px-5 text-sm font-bold">
                  {list.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />} Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {editing && <AccountDialog open={editing} onOpenChange={setEditing} account={account} />}
    </div>
  )
}
