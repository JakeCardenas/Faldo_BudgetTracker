"use client"

import Link from "next/link"
import { use, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Archive, ArrowLeft, Pencil } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { ResponsiveContainer, Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts"
import { AccountDialog } from "@/components/finance/account-dialog"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { TransactionRow } from "@/components/finance/transaction-row"
import { useAppActions } from "@/components/layout/app-context"
import { SectionCard } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { ACCOUNT_TYPE_LABELS, formatDate, formatMoney } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useTransactions } from "@/lib/queries"

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const { openTransaction } = useAppActions()
  const [editing, setEditing] = useState(false)
  const { data: accounts, isLoading } = useAccounts(true)
  const account = accounts?.find((a) => a.id === id)
  const { data: history } = useQuery({
    queryKey: ["account-history", id],
    queryFn: () => api.get<{ date: string; balance_minor: number }[]>(`/accounts/${id}/history`, { days: 90 }),
  })
  const { data: txns } = useTransactions({ account_id: [id], limit: 25 })

  if (isLoading) return <div className="space-y-4 pt-2"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
  if (!account) return <EmptyState icon={Archive} title="Account not found" action={<Button asChild variant="outline"><Link href="/accounts">Back to accounts</Link></Button>} />

  async function toggleArchive() {
    await api.patch(`/accounts/${id}`, { archived: !account!.archived })
    await invalidateFinancialData(qc)
    toast.success(account!.archived ? "Account restored" : "Account archived")
  }

  return (
    <div className="space-y-5 pt-2">
      <Link href="/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Accounts</Link>
      <div className="card-surface flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{account.custom_type ?? ACCOUNT_TYPE_LABELS[account.type]}{account.institution && ` · ${account.institution}`}{account.archived && " · Archived"}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
          <Money minor={account.balance_minor} className="block pt-2 text-4xl font-semibold tracking-tight" />
          <p className="text-xs text-muted-foreground">Last activity {account.last_activity_on ? formatDate(account.last_activity_on) : "—"} · {account.transaction_count} transactions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
          <Button variant="ghost" onClick={toggleArchive}><Archive /> {account.archived ? "Restore" : "Archive"}</Button>
        </div>
      </div>
      <SectionCard title="Balance, last 90 days">
        {history ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={history} margin={{ left: -8, right: 4, top: 8 }}>
              <defs><linearGradient id="acc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(d) => formatDate(d, "MMM d")} minTickGap={32} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => formatMoney(v, "PHP", { compact: true })} width={56} />
              <Tooltip formatter={(v) => formatMoney(Number(v))} labelFormatter={(d) => formatDate(String(d))} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
              <Area dataKey="balance_minor" name="Balance" stroke="var(--chart-1)" strokeWidth={2} fill="url(#acc)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : <Skeleton className="h-[220px]" />}
      </SectionCard>
      <SectionCard title="Transactions" bodyClassName="px-3 pb-3 pt-2" action={<Link href={`/transactions`} className="text-xs font-medium text-primary hover:underline">All transactions</Link>}>
        {txns?.items.length ? (
          <div className="divide-y divide-border/60">{txns.items.map((t) => <TransactionRow key={t.id} transaction={t} showDate onClick={() => openTransaction(t.id)} />)}</div>
        ) : <p className="px-2 py-8 text-center text-sm text-muted-foreground">No transactions in this account yet.</p>}
      </SectionCard>
      {editing && <AccountDialog open={editing} onOpenChange={setEditing} account={account} />}
    </div>
  )
}
