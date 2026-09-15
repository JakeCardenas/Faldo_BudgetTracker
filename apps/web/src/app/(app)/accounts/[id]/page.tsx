"use client"

import Link from "next/link"
import { use, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { Archive, ArchiveRestore, ArrowLeftRight, Loader2, Minus, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { AccountDialog } from "@/components/finance/account-dialog"
import { DayGroups } from "@/components/finance/day-groups"
import { EmptyState } from "@/components/finance/empty-state"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { Segmented } from "@/components/ios/segmented"
import { Button } from "@/components/ui/button"
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

  if (isLoading) return <div className="space-y-4 pt-16 lg:pt-24"><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div>
  if (!account) return <EmptyState icon={Archive} title="Account not found" action={<Button variant="outline" asChild><Link href="/accounts">Back to wallet</Link></Button>} />

  async function toggleArchive() {
    await api.patch(`/accounts/${id}`, { archived: !account!.archived })
    await invalidateFinancialData(qc)
    toast.success(account!.archived ? "Account restored" : "Account archived")
  }

  return (
    <div className="space-y-5">
      <LargeTitle title={account.name} back={{ href: "/accounts", label: "Wallet" }}
        subtitle={account.archived ? "Archived account" : undefined}
        actions={<>
          <HeaderButton onClick={toggleArchive} aria-label={account.archived ? "Restore account" : "Archive account"}>
            {account.archived ? <ArchiveRestore /> : <Archive />}<span className="max-lg:sr-only">{account.archived ? "Restore" : "Archive"}</span>
          </HeaderButton>
          <HeaderButton onClick={() => setEditing(true)} aria-label="Edit account"><Pencil /><span className="max-lg:sr-only">Edit</span></HeaderButton>
        </>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-6">
          <AccountCard account={account} large />
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="lg" className="px-2" onClick={() => openAddTransaction({ mode: "expense", preset: { account_id: id } })}><Minus className="text-muted-foreground" /> Expense</Button>
            <Button variant="outline" size="lg" className="px-2" onClick={() => openAddTransaction({ mode: "income", preset: { account_id: id } })}><Plus className="text-muted-foreground" /> Income</Button>
            <Button variant="outline" size="lg" className="px-2" onClick={() => openAddTransaction({ mode: "transfer", preset: { account_id: id } })}><ArrowLeftRight className="text-muted-foreground" /> Transfer</Button>
          </div>
          <section className="card-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="section-title">Balance trend</p>
              <Segmented label="Range" size="sm" value={days} onChange={setDays}
                options={[{ value: "30", label: "30D" }, { value: "90", label: "90D" }, { value: "365", label: "1Y" }]} />
            </div>
            {history ? (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={history} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
                  <defs><linearGradient id="acc-trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.14} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="date" hide />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} labelFormatter={(d) => formatDate(String(d))}
                    contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12, boxShadow: "var(--elevation-float)" }} />
                  <Area dataKey="balance_minor" name="Balance" stroke="var(--primary)" strokeWidth={1.75} fill="url(#acc-trend)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Skeleton className="mt-3 h-[150px] rounded-xl" />}
            <p className="text-xs text-muted-foreground">{account.transaction_count} transactions{account.last_activity_on && `, last activity ${formatDate(account.last_activity_on, "MMM d")}`}</p>
          </section>
        </div>

        <div className="min-w-0 space-y-3">
          <h2 className="section-title px-1">History</h2>
          {list.isLoading ? <Skeleton className="h-64 rounded-xl" /> : items.length === 0 ? (
            <p className="card-surface px-4 py-10 text-center text-sm text-muted-foreground">No transactions in this account yet.</p>
          ) : (
            <>
              <DayGroups items={items} onOpen={openTransaction} stickyTop="top-[calc(3rem+env(safe-area-inset-top))] lg:top-0 -mx-1 px-2 pt-2" />
              {list.hasNextPage && (
                <Button variant="outline" className="mx-auto flex" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage && <Loader2 className="animate-spin" />} Load more
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {editing && <AccountDialog open={editing} onOpenChange={setEditing} account={account} />}
    </div>
  )
}
