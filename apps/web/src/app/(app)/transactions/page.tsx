"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowDownUp, ChevronRight, Download, Loader2, Plus, Receipt as ReceiptIcon, ScanLine, Search, SlidersHorizontal, X } from "lucide-react"
import { DayGroups } from "@/components/finance/day-groups"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { TransactionRow } from "@/components/finance/transaction-row"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { Chip, Segmented } from "@/components/ios/segmented"
import { IosSheet } from "@/components/ios/sheet"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { useAccounts, useCategories } from "@/lib/queries"
import type { Receipt, TransactionList } from "@/lib/types"
import { cn } from "@/lib/utils"

const ALL = "all"
type Kind = "all" | "expense" | "income" | "transfer"

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const SORTS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "amount_desc", label: "Largest amount" },
  { value: "amount_asc", label: "Smallest amount" },
]

function HistoryView() {
  const params = useSearchParams()
  const { openAddTransaction, openTransaction } = useAppActions()
  const [q, setQ] = useState(params.get("q") ?? "")
  const [kind, setKind] = useState<Kind>("all")
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
    type: kind === ALL ? undefined : [kind],
    account_id: accountId === ALL ? undefined : [accountId],
    category_id: categoryId === ALL ? undefined : [categoryId],
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    tag: tag === ALL ? undefined : tag,
    sort,
    limit: 40,
  }), [search, kind, accountId, categoryId, dateFrom, dateTo, tag, sort])

  const list = useInfiniteQuery({
    queryKey: ["transactions", "infinite", query],
    queryFn: ({ pageParam }) => api.get<TransactionList>("/transactions", { ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const summary = list.data?.pages[0]
  const activeFilters = [accountId, categoryId, tag].filter((v) => v !== ALL).length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)
  const clear = () => { setAccountId(ALL); setCategoryId(ALL); setTag(ALL); setDateFrom(""); setDateTo("") }
  const topCategories = categories.filter((c) => !c.parent_id)
  const accountName = accounts.find((a) => a.id === accountId)?.name
  const categoryName = categories.find((c) => c.id === categoryId)?.name

  return (
    <div className="space-y-4">
      <LargeTitle title="History"
        actions={<>
          <a href="/api/v1/me/export" className="glass-control pressable hidden h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold lg:flex"><Download className="size-[1.05rem] text-foreground/75" /> Export</a>
          <HeaderButton onClick={() => openAddTransaction({ mode: "expense" })}><Plus /> Add</HeaderButton>
        </>} />

      {pendingReceipts.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-secondary/70 p-3 pr-3 dark:bg-secondary/60">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-primary"><ScanLine className="size-4.5" strokeWidth={1.85} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{pendingReceipts.length} receipt{pendingReceipts.length === 1 ? "" : "s"} to review</p>
            <p className="truncate text-[0.8125rem] text-muted-foreground">{pendingReceipts.map((r) => r.extraction?.merchant ?? "Receipt").join(", ")}</p>
          </div>
          <Button size="sm" onClick={() => openAddTransaction({ receipt: pendingReceipts[0] })}>
            Review{pendingReceipts[0].status === "processing" ? "…" : ""}
          </Button>
        </div>
      )}

      <div className="glass sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-20 -mx-5 space-y-2.5 px-5 pt-1 pb-3 sm:-mx-6 sm:px-6 lg:top-16 lg:-mx-2 lg:px-2 lg:pt-3">
        <div className="flex gap-2">
          <label className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 shadow-[inset_0_0_0_1px_var(--border)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--ring)] focus-within:ring-3 focus-within:ring-ring/20">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Search transactions</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions"
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80 sm:text-sm" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="flex size-5 items-center justify-center rounded-full bg-muted-foreground/25 text-foreground/70"><X className="size-3" /></button>}
          </label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-11! w-11 justify-center rounded-full border-0 px-0 shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent [&>svg:last-child]:hidden" aria-label="Sort"><ArrowDownUp className="size-4 text-foreground/80" /></SelectTrigger>
            <SelectContent align="end">{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <button type="button" onClick={() => setFiltersOpen(true)} aria-label="Filters"
            className="pressable relative flex size-11 items-center justify-center rounded-full bg-card shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent">
            <SlidersHorizontal className="size-4 text-foreground/80" />
            {activeFilters > 0 && <span className="tabular absolute -top-1.5 -right-1.5 flex size-4.5 items-center justify-center rounded-full bg-primary text-[0.625rem] font-semibold text-primary-foreground">{activeFilters}</span>}
          </button>
        </div>
        <Segmented label="Transaction type" className="w-full" size="sm" value={kind} onChange={setKind}
          options={[{ value: "all", label: "All" }, { value: "expense", label: "Expenses" }, { value: "income", label: "Income" }, { value: "transfer", label: "Transfers" }]} />
        {activeFilters > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {accountName && <Chip active onClick={() => setAccountId(ALL)}>{accountName} <X className="ml-1 inline size-3" /></Chip>}
            {categoryName && <Chip active onClick={() => setCategoryId(ALL)}>{categoryName} <X className="ml-1 inline size-3" /></Chip>}
            {tag !== ALL && <Chip active onClick={() => setTag(ALL)}>#{tag} <X className="ml-1 inline size-3" /></Chip>}
            {(dateFrom || dateTo) && <Chip active onClick={() => { setDateFrom(""); setDateTo("") }}>{dateFrom ? formatDate(dateFrom, "MMM d") : "Start"} to {dateTo ? formatDate(dateTo, "MMM d") : "now"} <X className="ml-1 inline size-3" /></Chip>}
          </div>
        )}
      </div>

      {summary && summary.total_count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            <span className="tabular">{summary.total_count}</span> {summary.total_count === 1 ? "transaction" : "transactions"},{" "}
            <Money minor={summary.total_income_minor} className={cn("font-medium", summary.total_income_minor > 0 ? "text-income" : "text-foreground")} /> in,{" "}
            <Money minor={summary.total_expense_minor} className="font-medium text-foreground" /> out
          </p>
          <Link href="/reports" className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:opacity-80">Where it went <ChevronRight className="size-3.5" /></Link>
        </div>
      )}

      {list.isLoading ? (
        <div className="ios-group divide-y divide-border/60">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex items-center gap-3 px-4 py-3"><Skeleton className="size-10 rounded-full" /><div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-1/4" /></div><Skeleton className="h-3.5 w-16" /></div>)}</div>
      ) : items.length === 0 ? (
        <div className="card-surface">
          {search || activeFilters || kind !== ALL ? (
            <EmptyState icon={Search} title="No matching transactions" description="Try a different search or clear your filters."
              action={<Button variant="outline" onClick={() => { setQ(""); setKind("all"); clear() }}>Clear all</Button>} />
          ) : (
            <EmptyState icon={ReceiptIcon} title="No transactions yet" description="Your money story starts here. Everything you log shows up in this list, grouped by day."
              action={<Button size="lg" onClick={() => openAddTransaction({ mode: "expense" })}><Plus /> Log your first expense</Button>} />
          )}
        </div>
      ) : sort.startsWith("date") ? (
        <DayGroups items={items} onOpen={openTransaction} />
      ) : (
        <div className="ios-group divide-y divide-border/60">
          {items.map((t) => <TransactionRow key={t.id} transaction={t} showDate onClick={() => openTransaction(t.id)} />)}
        </div>
      )}

      {list.hasNextPage && (
        <Button variant="outline" className="mx-auto flex" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          {list.isFetchingNextPage && <Loader2 className="animate-spin" />} Load more
        </Button>
      )}

      <IosSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" size="sm"
        footer={<div className="flex gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={clear}>Reset</Button>
          <Button size="lg" className="flex-1" onClick={() => setFiltersOpen(false)}>Show results</Button>
        </div>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[0.8125rem] text-muted-foreground">Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All accounts</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[0.8125rem] text-muted-foreground">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All categories</SelectItem>{topCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[0.8125rem] text-muted-foreground">Tag</Label>
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All tags</SelectItem>{tags.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="from" className="text-[0.8125rem] text-muted-foreground">From</Label><Input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="to" className="text-[0.8125rem] text-muted-foreground">To</Label><Input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          </div>
        </div>
      </IosSheet>
    </div>
  )
}

export default function TransactionsPage() {
  return <Suspense><HistoryView /></Suspense>
}
