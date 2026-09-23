"use client"

import Link from "next/link"
import { use, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { Archive, ArchiveRestore, ArrowLeftRight, Loader2, Minus, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { BalanceLine } from "@/components/charts/charts"
import { AccountDialog } from "@/components/finance/account-dialog"
import { TINTED } from "@/components/finance/category-icon"
import { DayGroups } from "@/components/finance/day-groups"
import { EmptyState } from "@/components/finance/empty-state"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { Button } from "@/components/ui/button"
import { useAppActions } from "@/components/layout/app-context"
import { AccountCard } from "@/components/wallet/account-card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { PALETTE } from "@/lib/palette"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"
import { invalidateFinancialData, useAccounts } from "@/lib/queries"
import type { TransactionList } from "@/lib/types"

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const { openTransaction, openAddTransaction } = useAppActions()
  const [editing, setEditing] = useState(false)
  const [days, setDays] = useState<"30" | "90" | "365">("90")
  const ranges = [{ value: "30", label: "1M" }, { value: "90", label: "3M" }, { value: "365", label: "1Y" }] as const
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

  if (isLoading) return <div className="space-y-4 pt-16 lg:pt-24"><Skeleton className="aspect-[1.586] w-full max-w-sm rounded-3xl" /><Skeleton className="h-80 rounded-2xl" /></div>
  if (!account) return <EmptyState icon={Archive} title="Account not found" action={<Button variant="outline" asChild><Link href="/accounts">Back to accounts</Link></Button>} />

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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,24rem)_1fr] lg:items-start lg:gap-12">
        <div className="space-y-6 lg:sticky lg:top-24">
          <AccountCard account={account} large />
          <div className="grid grid-cols-3 gap-2">
            {([["expense", "Expense", Minus, PALETTE.coral], ["income", "Income", Plus, PALETTE.green], ["transfer", "Transfer", ArrowLeftRight, PALETTE.blue]] as const).map(([mode, label, Icon, tint]) => (
              <button key={mode} type="button" onClick={() => openAddTransaction({ mode, preset: { account_id: id } })}
                className="pressable flex flex-col items-center gap-1.5 rounded-2xl py-1 text-[0.8125rem] font-medium">
                <span style={{ "--cat": tint } as React.CSSProperties} className={cn("flex size-12 items-center justify-center rounded-full", TINTED)}><Icon className="size-5" strokeWidth={2} /></span>
                {label}
              </button>
            ))}
          </div>
          <section aria-label="Balance trend">
            <div className="-mx-2 h-[168px]">
              {history ? history.length > 1 ? <BalanceLine data={history.map((p) => ({ date: p.date, value: p.balance_minor }))} /> : (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Not enough history yet.</p>
              ) : <Skeleton className="mx-2 h-full rounded-2xl" />}
            </div>
            <div className="mt-1 flex justify-center gap-1" role="radiogroup" aria-label="Chart range">
              {ranges.map((r) => (
                <button key={r.value} type="button" role="radio" aria-checked={days === r.value} onClick={() => { play("select"); setDays(r.value) }}
                  className={cn("h-8 min-w-11 rounded-full px-3 text-[0.8125rem] font-medium transition-colors", days === r.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">{account.transaction_count} {account.transaction_count === 1 ? "transaction" : "transactions"}{account.last_activity_on && `, last on ${formatDate(account.last_activity_on, "MMM d")}`}</p>
          </section>
        </div>

        <div className="min-w-0 space-y-3">
          <h2 className="section-title">History</h2>
          {list.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : items.length === 0 ? (
            <p className="card-surface px-4 py-10 text-center text-sm text-muted-foreground">No transactions in this account yet.</p>
          ) : (
            <>
              <DayGroups items={items} onOpen={openTransaction} />
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
