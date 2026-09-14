"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { ArrowDownUp, Download, Filter, Loader2, Plus, Receipt as ReceiptIcon, ScanLine, Search, X } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { TransactionRow } from "@/components/finance/transaction-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate, formatDayLabel } from "@/lib/format"
import { useAccounts, useCategories } from "@/lib/queries"
import type { Receipt, Transaction, TransactionList } from "@/lib/types"

const ALL = "all"

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function TransactionsView() {
  const params = useSearchParams()
  const { openAddTransaction, openTransaction } = useAppActions()
  const [q, setQ] = useState(params.get("q") ?? "")
  const [type, setType] = useState(ALL)
  const [accountId, setAccountId] = useState(ALL)
  const [categoryId, setCategoryId] = useState(params.get("category") ?? ALL)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [tag, setTag] = useState(ALL)
  const [sort, setSort] = useState("date_desc")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const search = useDebounced(q)
  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => api.get<{ id: string; name: string }[]>("/tags") })
  const { data: pendingReceipts = [] } = useQuery({ queryKey: ["receipts"], queryFn: () => api.get<Receipt[]>("/receipts") })

  const query = useMemo(() => ({
    q: search || undefined,
    type: type === ALL ? undefined : [type],
    account_id: accountId === ALL ? undefined : [accountId],
    category_id: categoryId === ALL ? undefined : [categoryId],
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    tag: tag === ALL ? undefined : tag,
    sort,
    limit: 40,
  }), [search, type, accountId, categoryId, dateFrom, dateTo, tag, sort])

  const list = useInfiniteQuery({
    queryKey: ["transactions", "infinite", query],
    queryFn: ({ pageParam }) => api.get<TransactionList>("/transactions", { ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  const pages = list.data?.pages ?? []
  const items = pages.flatMap((p) => p.items)
  const summary = pages[0]
  const activeFilters = [type, accountId, categoryId, tag].filter((v) => v !== ALL).length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)
  const grouped = useMemo(() => {
    if (!sort.startsWith("date")) return [{ key: "all", label: null as string | null, items }]
    const groups: { key: string; label: string | null; items: Transaction[] }[] = []
    for (const t of items) {
      const last = groups[groups.length - 1]
      if (last && last.key === t.occurred_on) last.items.push(t)
      else groups.push({ key: t.occurred_on, label: formatDayLabel(t.occurred_on), items: [t] })
    }
    return groups
  }, [items, sort])

  const clear = () => { setType(ALL); setAccountId(ALL); setCategoryId(ALL); setTag(ALL); setDateFrom(""); setDateTo("") }
  const topCategories = categories.filter((c) => !c.parent_id)

  const filterControls = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="expense">Expenses</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="transfer">Transfers</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Account</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-full bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {topCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Tag</Label>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="w-full bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tags</SelectItem>
            {tags.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="from" className="text-xs text-muted-foreground">From</Label>
        <Input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-card" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="to" className="text-xs text-muted-foreground">To</Label>
        <Input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-card" />
      </div>
    </div>
  )

  return (
    <div className="space-y-5 pt-2">
      <PageHeader title="Transactions" description="Every peso in and out, searchable down to the item."
        actions={<>
          <Button variant="outline" asChild className="hidden sm:inline-flex"><a href="/api/v1/me/export"><Download /> Export</a></Button>
          <Button onClick={() => openAddTransaction()}><Plus /> Add transaction</Button>
        </>} />

      {pendingReceipts.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/15 bg-mint/40 p-4 sm:flex-row sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary"><ScanLine className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{pendingReceipts.length} receipt{pendingReceipts.length === 1 ? "" : "s"} waiting for review</p>
            <p className="text-xs text-muted-foreground">Confirm the details to turn them into transactions.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingReceipts.slice(0, 3).map((r) => (
              <Button key={r.id} size="sm" variant="outline" className="bg-card" onClick={() => openAddTransaction({ receipt: r })}>
                {r.extraction?.merchant ?? "Receipt"} · {r.status === "processing" ? "reading…" : formatDate(r.created_at, "MMM d")}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="card-surface space-y-3 p-3 sm:p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant, item, note, tag…" className="h-10 bg-card pl-9" aria-label="Search transactions" />
            {q && <button onClick={() => setQ("")} className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Clear search"><X className="size-3.5" /></button>}
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-10! w-auto gap-2 bg-card" aria-label="Sort"><ArrowDownUp className="size-4" /><span className="hidden sm:inline"><SelectValue /></span></SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="date_desc">Newest first</SelectItem>
              <SelectItem value="date_asc">Oldest first</SelectItem>
              <SelectItem value="amount_desc">Largest amount</SelectItem>
              <SelectItem value="amount_asc">Smallest amount</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-10 lg:hidden" onClick={() => setFiltersOpen(true)} aria-label="Filters">
            <Filter />{activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground">{activeFilters}</span>}
          </Button>
        </div>
        <div className="hidden lg:block">{filterControls}</div>
        {activeFilters > 0 && <button onClick={clear} className="text-xs font-medium text-primary hover:underline">Clear filters</button>}
      </div>

      {summary && summary.total_count > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-sm text-muted-foreground">
          <span><span className="tabular font-medium text-foreground">{summary.total_count}</span> transactions</span>
          <span>In <Money minor={summary.total_income_minor} className="font-medium text-emerald" /></span>
          <span>Out <Money minor={summary.total_expense_minor} className="font-medium text-foreground" /></span>
        </div>
      )}

      <div className="card-surface overflow-clip">
        {list.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : items.length === 0 ? (
          search || activeFilters ? (
            <EmptyState icon={Search} title="No matching transactions" description="Try a different search or clear your filters."
              action={<Button variant="outline" size="sm" onClick={() => { setQ(""); clear() }}>Clear all</Button>} />
          ) : (
            <EmptyState icon={ReceiptIcon} title="No transactions yet" description="Your financial story starts here."
              action={<Button onClick={() => openAddTransaction()}><Plus /> Add your first transaction</Button>} />
          )
        ) : (
          <div>
            {grouped.map((group) => (
              <div key={group.key}>
                {group.label && (
                  <div className="sticky top-14 z-10 flex items-center justify-between border-y border-border/60 bg-surface/95 px-5 py-2 text-xs font-medium text-muted-foreground backdrop-blur lg:top-16">
                    <span>{group.label}</span>
                    <Money minor={group.items.reduce((s, t) => s + (t.type === "income" ? t.amount_minor : t.type === "expense" ? -t.amount_minor : 0), 0)} signed />
                  </div>
                )}
                <div className="divide-y divide-border/50 px-3">
                  {group.items.map((t) => <TransactionRow key={t.id} transaction={t} showDate={!group.label} onClick={() => openTransaction(t.id)} />)}
                </div>
              </div>
            ))}
            {list.hasNextPage && (
              <div className="border-t p-3 text-center">
                <Button variant="ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage ? <><Loader2 className="animate-spin" /> Loading</> : "Load more"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe">
          <SheetHeader><SheetTitle>Filters</SheetTitle><SheetDescription>Narrow down your transactions</SheetDescription></SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            {filterControls}
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={clear}>Reset</Button><Button className="flex-1" onClick={() => setFiltersOpen(false)}>Show results</Button></div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default function TransactionsPage() {
  return <Suspense><TransactionsView /></Suspense>
}
