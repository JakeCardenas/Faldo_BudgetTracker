"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { ArrowDownUp, Download, Loader2, Plus, Receipt as ReceiptIcon, ScanLine, Search, SlidersHorizontal, TrendingDown, TrendingUp, X } from "lucide-react"
import { DayGroups } from "@/components/finance/day-groups"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { TransactionRow } from "@/components/finance/transaction-row"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { Chip, Segmented } from "@/components/ios/segmented"
import { IosSheet } from "@/components/ios/sheet"
import { useAppActions } from "@/components/layout/app-context"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { useAccounts, useCategories } from "@/lib/queries"
import type { Receipt, TransactionList } from "@/lib/types"

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
      <LargeTitle title="History" subtitle="Every peso in and out, searchable down to the item."
        actions={<>
          <a href="/api/v1/me/export" className="pressable hidden h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-semibold shadow-(--shadow-card) lg:flex"><Download className="size-4" /> Export</a>
          <HeaderButton onClick={() => openAddTransaction({ mode: "expense" })} className="text-primary"><Plus className="size-4" /> Add</HeaderButton>
        </>} />

      {pendingReceipts.length > 0 && (
        <div className="flex items-center gap-3 rounded-[1.25rem] bg-secondary p-3 pr-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary"><ScanLine className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{pendingReceipts.length} receipt{pendingReceipts.length === 1 ? "" : "s"} to review</p>
            <p className="truncate text-xs text-muted-foreground">{pendingReceipts.map((r) => r.extraction?.merchant ?? "Receipt").join(", ")}</p>
          </div>
          <button type="button" onClick={() => openAddTransaction({ receipt: pendingReceipts[0] })}
            className="pressable h-9 shrink-0 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">
            Review{pendingReceipts[0].status === "processing" ? "…" : ""}
          </button>
        </div>
      )}

      <div className="sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-20 -mx-4 space-y-2.5 bg-background/85 px-4 pt-1 pb-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-16 lg:mx-0 lg:px-0">
        <div className="flex gap-2">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-muted px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Search transactions</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant, item, note, tag"
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="flex size-5 items-center justify-center rounded-full bg-muted-foreground/30 text-background"><X className="size-3" /></button>}
          </label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-10! w-10 justify-center rounded-xl border-0 bg-muted px-0 [&>svg:last-child]:hidden" aria-label="Sort"><ArrowDownUp className="size-4" /></SelectTrigger>
            <SelectContent align="end">{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <button type="button" onClick={() => setFiltersOpen(true)} aria-label="Filters"
            className="pressable relative flex size-10 items-center justify-center rounded-xl bg-muted">
            <SlidersHorizontal className="size-4" />
            {activeFilters > 0 && <span className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground">{activeFilters}</span>}
          </button>
        </div>
        <Segmented label="Transaction type" className="w-full" size="sm" value={kind} onChange={setKind}
          options={[{ value: "all", label: "All" }, { value: "expense", label: "Expenses" }, { value: "income", label: "Income" }, { value: "transfer", label: "Transfers" }]} />
        {activeFilters > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {accountName && <Chip active onClick={() => setAccountId(ALL)}>{accountName} <X className="ml-1 inline size-3" /></Chip>}
            {categoryName && <Chip active onClick={() => setCategoryId(ALL)}>{categoryName} <X className="ml-1 inline size-3" /></Chip>}
            {tag !== ALL && <Chip active onClick={() => setTag(ALL)}>#{tag} <X className="ml-1 inline size-3" /></Chip>}
            {(dateFrom || dateTo) && <Chip active onClick={() => { setDateFrom(""); setDateTo("") }}>{dateFrom ? formatDate(dateFrom, "MMM d") : "Start"} – {dateTo ? formatDate(dateTo, "MMM d") : "now"} <X className="ml-1 inline size-3" /></Chip>}
          </div>
        )}
      </div>

      {summary && summary.total_count > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card-surface p-3"><p className="eyebrow">Count</p><p className="tabular text-lg font-extrabold">{summary.total_count}</p></div>
          <div className="card-surface p-3"><p className="eyebrow flex items-center gap-1"><TrendingUp className="size-3 text-income" /> In</p><Money minor={summary.total_income_minor} compact className="text-lg font-extrabold text-income" /></div>
          <div className="card-surface p-3"><p className="eyebrow flex items-center gap-1"><TrendingDown className="size-3 text-expense" /> Out</p><Money minor={summary.total_expense_minor} compact className="text-lg font-extrabold" /></div>
        </div>
      )}

      {list.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="card-surface">
          {search || activeFilters || kind !== ALL ? (
            <EmptyState icon={Search} title="No matching transactions" description="Try a different search or clear your filters."
              action={<button type="button" onClick={() => { setQ(""); setKind("all"); clear() }} className="text-sm font-bold text-primary">Clear all</button>} />
          ) : (
            <EmptyState icon={ReceiptIcon} title="No transactions yet" description="Your financial story starts here."
              action={<button type="button" onClick={() => openAddTransaction({ mode: "expense" })} className="pressable flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"><Plus className="size-4" /> Log your first expense</button>} />
          )}
        </div>
      ) : sort.startsWith("date") ? (
        <DayGroups items={items} onOpen={openTransaction} />
      ) : (
        <div className="ios-group divide-y divide-border/50 px-2">
          {items.map((t) => <TransactionRow key={t.id} transaction={t} showDate onClick={() => openTransaction(t.id)} />)}
        </div>
      )}

      {list.hasNextPage && (
        <button type="button" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}
          className="pressable mx-auto flex h-10 items-center gap-2 rounded-full border bg-card px-5 text-sm font-bold shadow-(--shadow-card)">
          {list.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />} Load more
        </button>
      )}

      <IosSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" description="Narrow down your history" size="sm"
        footer={<div className="flex gap-2">
          <button type="button" onClick={clear} className="pressable h-12 flex-1 rounded-2xl border bg-card text-sm font-bold">Reset</button>
          <button type="button" onClick={() => setFiltersOpen(false)} className="pressable h-12 flex-1 rounded-2xl bg-primary text-sm font-bold text-primary-foreground">Show results</button>
        </div>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="eyebrow">Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-11! w-full rounded-xl bg-card"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All accounts</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="eyebrow">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11! w-full rounded-xl bg-card"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All categories</SelectItem>{topCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="eyebrow">Tag</Label>
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="h-11! w-full rounded-xl bg-card"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All tags</SelectItem>{tags.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="from" className="eyebrow">From</Label><Input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-11 rounded-xl bg-card" /></div>
            <div className="space-y-1.5"><Label htmlFor="to" className="eyebrow">To</Label><Input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-11 rounded-xl bg-card" /></div>
          </div>
        </div>
      </IosSheet>
    </div>
  )
}

export default function TransactionsPage() {
  return <Suspense><HistoryView /></Suspense>
}
