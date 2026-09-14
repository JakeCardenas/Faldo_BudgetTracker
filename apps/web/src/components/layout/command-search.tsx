"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { BookText, Landmark, Plus, ShoppingBag, Sparkles, Store, Tag, Target } from "lucide-react"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { ALL_NAV } from "@/components/layout/nav"
import { api } from "@/lib/api"
import { formatDate, formatMoney } from "@/lib/format"
import type { SearchResults } from "@/lib/types"

function useDebounced<T>(value: T, delay = 220) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function CommandSearch({ open, onOpenChange, onAddTransaction, onOpenTransaction }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddTransaction: () => void
  onOpenTransaction: (id: string) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const debounced = useDebounced(query.trim())
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.get<SearchResults>("/search", { q: debounced }),
    enabled: open && debounced.length > 1,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const go = (fn: () => void) => { onOpenChange(false); setQuery(""); fn() }
  const hasResults = data && (data.transactions.length || data.items.length || data.merchants.length || data.categories.length ||
    data.goals.length || data.accounts.length || data.memory.length)

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Faldo" description="Search transactions, items, goals and more" className="sm:max-w-xl">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search transactions, merchants, items, goals…" />
      <CommandList className="max-h-[60vh]">
        {debounced.length > 1 && !isFetching && !hasResults && <CommandEmpty>No matches in your data.</CommandEmpty>}
        {debounced.length > 1 && (
          <CommandGroup heading="Ask the assistant">
            <CommandItem value={`ask ${query}`} onSelect={() => go(() => router.push(`/assistant?q=${encodeURIComponent(query)}`))}>
              <Sparkles className="text-primary" /> Ask Faldo: “{query}”
            </CommandItem>
          </CommandGroup>
        )}
        {data && data.transactions.length > 0 && (
          <CommandGroup heading="Transactions">
            {data.transactions.map((t) => (
              <CommandItem key={t.id} value={`txn ${t.id} ${t.merchant} ${query}`} onSelect={() => go(() => onOpenTransaction(t.id))}>
                <ShoppingBag />
                <span className="flex-1 truncate">{t.merchant ?? t.category_name ?? "Transaction"} <span className="text-muted-foreground">· {formatDate(t.occurred_on, "MMM d")}</span></span>
                <span className="tabular text-xs">{formatMoney(t.type === "expense" ? -t.amount_minor : t.amount_minor)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {data && data.items.length > 0 && (
          <CommandGroup heading="Purchase items">
            {data.items.map((i) => (
              <CommandItem key={i.id} value={`item ${i.id} ${i.name} ${query}`} onSelect={() => go(() => onOpenTransaction(i.transaction_id))}>
                <Tag /> <span className="flex-1 truncate">{i.name}</span><span className="tabular text-xs">{formatMoney(i.amount_minor)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {data && (data.merchants.length > 0 || data.categories.length > 0) && (
          <CommandGroup heading="Merchants & categories">
            {data.merchants.map((m) => (
              <CommandItem key={m.id} value={`merchant ${m.id} ${m.name} ${query}`} onSelect={() => go(() => router.push(`/transactions?q=${encodeURIComponent(m.name)}`))}>
                <Store /> {m.name}
              </CommandItem>
            ))}
            {data.categories.map((c) => (
              <CommandItem key={c.id} value={`category ${c.id} ${c.name} ${query}`} onSelect={() => go(() => router.push(`/transactions?category=${c.id}`))}>
                <Tag style={{ color: c.color ?? undefined }} /> {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {data && (data.goals.length > 0 || data.accounts.length > 0) && (
          <CommandGroup heading="Goals & accounts">
            {data.goals.map((g) => (
              <CommandItem key={g.id} value={`goal ${g.id} ${g.name} ${query}`} onSelect={() => go(() => router.push("/goals"))}><Target /> {g.name}</CommandItem>
            ))}
            {data.accounts.map((a) => (
              <CommandItem key={a.id} value={`account ${a.id} ${a.name} ${query}`} onSelect={() => go(() => router.push(`/accounts/${a.id}`))}><Landmark /> {a.name}</CommandItem>
            ))}
          </CommandGroup>
        )}
        {data && data.memory.length > 0 && (
          <CommandGroup heading="From your financial memory">
            {data.memory.map((m) => (
              <CommandItem key={m.entity_id} value={`memory ${m.entity_id} ${query}`} onSelect={() => go(() => router.push(`/assistant?q=${encodeURIComponent(`Tell me about: ${m.title}`)}`))}>
                <BookText />
                <span className="min-w-0 flex-1"><span className="block truncate">{m.title.replace(/^\[[^\]]+\]\s*/, "")}</span><span className="block truncate text-xs text-muted-foreground">{m.snippet}</span></span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Quick actions">
          <CommandItem value="add transaction" onSelect={() => go(onAddTransaction)}><Plus /> Add transaction</CommandItem>
          {ALL_NAV.map((item) => (
            <CommandItem key={item.href} value={`go ${item.label}`} onSelect={() => go(() => router.push(item.href))}>
              <item.icon /> Go to {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
