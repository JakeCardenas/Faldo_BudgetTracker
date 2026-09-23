"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { format, subDays } from "date-fns"
import { ArrowRight, CalendarDays, Check, ChevronDown, Delete, Grid3x3, NotebookPen, Plus, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { CategoryIcon } from "@/components/finance/category-icon"
import { Chip } from "@/components/ios/segmented"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { api, ApiError } from "@/lib/api"
import { evaluate, formatExpression, hasOperation, pressKey } from "@/lib/calculator"
import { currencySymbol, formatMoney, monthKey, todayISO } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useBudget, useCategories, useMe, useTransactions } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Account, Category, Transaction, TransactionInput } from "@/lib/types"
import { cn } from "@/lib/utils"

export type EntryType = "expense" | "income" | "transfer"

export interface EntryPreset {
  amount_minor?: number | null
  note?: string | null
  category_id?: string | null
  account_id?: string | null
  to_account_id?: string | null
  occurred_on?: string
}

const LAST_ACCOUNT_KEY = "faldo:last-account"

const KEYS: { key: string; label?: React.ReactNode; tone: "digit" | "op" | "danger" | "primary" }[] = [
  { key: "⌫", label: <Delete className="size-5" />, tone: "danger" }, { key: "AC", tone: "danger" }, { key: "%", tone: "op" }, { key: "÷", tone: "op" },
  { key: "7", tone: "digit" }, { key: "8", tone: "digit" }, { key: "9", tone: "digit" }, { key: "×", tone: "op" },
  { key: "4", tone: "digit" }, { key: "5", tone: "digit" }, { key: "6", tone: "digit" }, { key: "−", tone: "op" },
  { key: "1", tone: "digit" }, { key: "2", tone: "digit" }, { key: "3", tone: "digit" }, { key: "+", tone: "op" },
  { key: "00", tone: "digit" }, { key: "0", tone: "digit" }, { key: ".", tone: "digit" }, { key: "=", tone: "primary" },
]

function readLastAccount() {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(LAST_ACCOUNT_KEY)
  } catch {
    return null
  }
}

function rememberAccount(id: string) {
  try {
    window.localStorage.setItem(LAST_ACCOUNT_KEY, id)
  } catch {}
}

function BudgetRing({ pct, color }: { pct: number; color: string }) {
  const r = 17
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--muted)" strokeWidth="3" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={pct > 100 ? "var(--expense)" : color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${Math.min(100, pct) / 100 * c} ${c}`} />
    </svg>
  )
}

function AccountPicker({ label, accounts, value, onChange, exclude }: {
  label: string
  accounts: Account[]
  value: string
  onChange: (id: string) => void
  exclude?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = accounts.find((a) => a.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="pressable flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg border bg-card px-2.5 text-left hover:bg-accent/60 aria-expanded:bg-accent/60">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.6875rem] font-semibold text-white"
          style={{ backgroundColor: selected?.color ?? "var(--primary)" }}>
          {(selected?.name ?? "?").slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.6875rem] leading-tight text-muted-foreground">{label}</span>
          <span className="block truncate text-sm leading-tight font-medium">{selected?.name ?? "Choose account"}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-1.5">
        <div className="max-h-72 overflow-y-auto">
          {accounts.filter((a) => a.id !== exclude).map((account) => (
            <button key={account.id} type="button" onClick={() => { onChange(account.id); setOpen(false) }}
              className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent", account.id === value && "bg-accent")}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.6875rem] font-semibold text-white"
                style={{ backgroundColor: account.color ?? "var(--primary)" }}>{account.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{account.name}</span>
                <span className="tabular block text-xs text-muted-foreground">{formatMoney(account.balance_minor, account.currency)}</span>
              </span>
              {account.id === value && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AddCategory({ kind, onCreated }: { kind: "expense" | "income"; onCreated: (c: Category) => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  async function create() {
    if (!name.trim()) return
    try {
      const category = await api.post<Category>("/categories", { name: name.trim(), kind })
      await qc.invalidateQueries({ queryKey: ["categories"] })
      onCreated(category)
      setName("")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't add that category.")
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="pressable flex h-10 items-center gap-1.5 rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground">
        <Plus className="size-4" /> Add
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <form onSubmit={(e) => { e.preventDefault(); create() }} className="flex gap-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Category name"
            className="h-9 min-w-0 flex-1 rounded-md border bg-card px-2.5 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/25 sm:text-sm" />
          <button type="submit" className="pressable h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Add</button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export function KeypadEntry({ type, preset, onSaved, onMoreDetails }: {
  type: EntryType
  preset?: EntryPreset
  onSaved: (transaction: Transaction, feedback: string) => void
  onMoreDetails: (values: Partial<TransactionInput> & { type: EntryType }) => void
}) {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: budget } = useBudget(monthKey())
  const { data: recent } = useTransactions({ type: [type], limit: 30 })
  const active = useMemo(() => accounts.filter((a) => !a.archived), [accounts])

  const [expr, setExpr] = useState(preset?.amount_minor ? String(preset.amount_minor / 100) : "")
  const [note, setNote] = useState(preset?.note ?? "")
  const [categoryId, setCategoryId] = useState(preset?.category_id ?? "")
  const [subcategoryId, setSubcategoryId] = useState("")
  const [accountId, setAccountId] = useState(preset?.account_id ?? "")
  const [toAccountId, setToAccountId] = useState(preset?.to_account_id ?? "")
  const [date, setDate] = useState(preset?.occurred_on ?? todayISO())
  const [keypad, setKeypad] = useState(true)
  const [saving, setSaving] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)

  const [remembered] = useState(readLastAccount)
  const defaultAccountId = useMemo(() => {
    if (!active.length) return ""
    const preferred = [preset?.account_id, remembered, me?.settings.default_account_id].find((id) => id && active.some((a) => a.id === id))
    return preferred ?? (active.find((a) => a.is_spendable) ?? active[0]).id
  }, [active, me, preset, remembered])
  const fromId = accountId || defaultAccountId
  const toId = toAccountId || (type === "transfer"
    ? active.find((a) => a.id !== fromId && a.type === "savings")?.id ?? active.find((a) => a.id !== fromId)?.id ?? ""
    : "")

  const value = evaluate(expr)
  const amountMinor = value !== null && value > 0 ? Math.round(value * 100) : 0
  const kind = type === "income" ? "income" : "expense"
  const subcategories = categories.filter((c) => c.parent_id === categoryId)
  const budgetByCategory = useMemo(() => new Map((budget?.lines ?? []).map((l) => [l.category_id, l])), [budget])
  // The categories you reach for first: most used in your recent entries of this type, then the ones with a budget,
  // then the rest in their usual order, so the common case is the first chip, not one screen down.
  const topCategories = useMemo(() => {
    const uses = new Map<string, number>()
    for (const t of recent?.items ?? []) if (t.category_id) uses.set(t.category_id, (uses.get(t.category_id) ?? 0) + 1)
    return categories.filter((c) => c.kind === kind && !c.parent_id)
      .map((c, i) => ({ c, i, used: uses.get(c.id) ?? 0, budgeted: budgetByCategory.has(c.id) ? 1 : 0 }))
      .sort((a, b) => b.used - a.used || b.budgeted - a.budgeted || a.i - b.i)
      .map(({ c }) => c)
  }, [categories, kind, recent, budgetByCategory])

  const templates = useMemo(() => {
    const seen = new Set<string>()
    const out: Transaction[] = []
    for (const t of recent?.items ?? []) {
      const key = `${t.merchant ?? t.notes ?? t.category_name}|${t.amount_minor}|${t.account_id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
      if (out.length === 6) break
    }
    return out
  }, [recent])

  const canSave = amountMinor > 0 && Boolean(fromId) && (type !== "transfer" || (Boolean(toId) && toId !== fromId))

  function press(key: string) {
    play(key === "=" ? "select" : key === "AC" || key === "⌫" ? "tap" : "type")
    if (key === "=") {
      if (value !== null) setExpr(value > 0 ? String(value) : "")
      return
    }
    setExpr((current) => pressKey(current, key))
  }

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    const input: TransactionInput = {
      type, amount_minor: amountMinor, occurred_on: date, account_id: fromId,
      to_account_id: type === "transfer" ? toId : null,
      category_id: type === "transfer" ? null : categoryId || null,
      subcategory_id: type === "transfer" ? null : subcategoryId || null,
      notes: note.trim() || null,
    }
    try {
      const transaction = await api.post<Transaction>("/transactions", input)
      rememberAccount(fromId)
      await invalidateFinancialData(qc)
      const account = active.find((a) => a.id === fromId)
      const line = categoryId ? budgetByCategory.get(categoryId) : undefined
      const category = categories.find((c) => c.id === categoryId)
      let feedback: string
      if (type === "transfer") {
        feedback = `Moved ${formatMoney(amountMinor)} from ${account?.name} to ${active.find((a) => a.id === toId)?.name}.`
      } else if (type === "income") {
        feedback = `${formatMoney(amountMinor)} added to ${account?.name}.`
      } else if (line && date.slice(0, 7) === monthKey()) {
        const spent = line.spent_minor + amountMinor
        const pct = Math.round((spent / line.limit_minor) * 100)
        feedback = spent > line.limit_minor
          ? `That puts ${line.category_name} ${formatMoney(spent - line.limit_minor)} over budget. Maybe ease up this week.`
          : `${line.category_name} is now at ${pct}% of its ${formatMoney(line.limit_minor)} budget.`
      } else {
        feedback = `Logged ${formatMoney(amountMinor)}${category ? ` for ${category.name}` : ""}. Your streak is safe for today.`
      }
      onSaved(transaction, feedback)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save that.")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        if (event.key === "Enter" && target.dataset.entryNote !== undefined) { event.preventDefault(); void save() }
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const map: Record<string, string> = { "*": "×", x: "×", "/": "÷", "-": "−", "+": "+", Backspace: "⌫", Delete: "AC", c: "AC", "%": "%", ".": ".", ",": "." }
      if (/^\d$/.test(event.key)) { event.preventDefault(); press(event.key) }
      else if (map[event.key]) { event.preventDefault(); press(map[event.key]) }
      else if (event.key === "=") { event.preventDefault(); press("=") }
      else if (event.key === "Enter") { event.preventDefault(); void save() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd")
  const symbol = currencySymbol(me?.settings.currency)
  const typeLabel = type === "expense" ? "Expense" : type === "income" ? "Income" : "Transfer"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 sm:px-5">
        <div className="flex min-h-24 flex-col items-center justify-center pt-3 pb-2" aria-live="polite">
          {hasOperation(expr) && <p className="tabular mb-1 text-sm text-muted-foreground">{formatExpression(expr)}</p>}
          <p className={cn("tabular flex items-start font-semibold tracking-[-0.035em]", amountMinor >= 1_000_000_00 ? "text-[2.5rem] leading-none" : "text-[3.25rem] leading-none")}>
            <span className="mt-[0.18em] mr-1 text-[0.5em] font-medium tracking-normal text-muted-foreground">{symbol}</span>
            {hasOperation(expr) ? (value !== null ? formatExpression(String(value)) : "0") : expr ? formatExpression(expr) : <span className="text-muted-foreground/35">0</span>}
          </p>
        </div>

        <label className="flex h-11 items-center gap-2.5 rounded-lg bg-muted px-3 focus-within:ring-3 focus-within:ring-ring/25">
          <NotebookPen className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} data-entry-note=""
            onFocus={() => setKeypad(false)}
            placeholder={type === "income" ? "Add a note, like Salary" : type === "transfer" ? "Add a note, like Move to savings" : "Add a note, like Lunch at Jollibee"}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80 sm:text-sm" />
        </label>

        {type === "transfer" && (
          <div className="flex items-center gap-2">
            <AccountPicker label="From" accounts={active} value={fromId} onChange={setAccountId} exclude={toId} />
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            <AccountPicker label="To" accounts={active} value={toId} onChange={setToAccountId} exclude={fromId} />
          </div>
        )}

        {templates.length > 0 && (
          <div className="space-y-2">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Recent {type === "income" ? "income" : type === "transfer" ? "transfers" : "expenses"}</p>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none">
              {templates.map((t) => (
                <button key={t.id} type="button" onClick={() => {
                  play("select")
                  setExpr(String(t.amount_minor / 100))
                  setNote(t.notes ?? t.merchant ?? "")
                  setCategoryId(t.category_id ?? "")
                  setSubcategoryId(t.subcategory_id ?? "")
                  setAccountId(t.account_id)
                  if (t.to_account_id) setToAccountId(t.to_account_id)
                }} className="pressable w-32 shrink-0 rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent/60">
                  <span className="tabular block text-sm font-semibold">{formatMoney(t.amount_minor, t.currency)}</span>
                  <span className="block truncate text-xs">{t.merchant ?? t.notes ?? t.category_name ?? typeLabel}</span>
                  <span className="block truncate text-[0.6875rem] text-muted-foreground">{t.account_name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {type !== "transfer" && (
          <div className="space-y-2">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Category <span className="font-normal text-muted-foreground/80">(optional)</span></p>
            <div className="flex flex-wrap gap-2">
              {topCategories.map((category) => {
                const line = budgetByCategory.get(category.id)
                const selected = category.id === categoryId
                return (
                  <button key={category.id} type="button" aria-pressed={selected}
                    onClick={() => { play("select"); setCategoryId(selected ? "" : category.id); setSubcategoryId("") }}
                    className={cn("pressable flex h-10 items-center gap-2 rounded-lg border bg-card pr-3 pl-1 text-left hover:bg-accent/60",
                      selected && "border-primary/45 bg-secondary hover:bg-secondary")}>
                    <span className="relative flex size-8 items-center justify-center">
                      {line && <BudgetRing pct={line.pct_used} color={category.color ?? "var(--primary)"} />}
                      <CategoryIcon icon={category.icon} color={category.color} size="sm" />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-sm">{category.name}</span>
                      {line && <span className="tabular block text-[0.6875rem] text-muted-foreground">{formatMoney(line.spent_minor, "PHP", { compact: true })} / {formatMoney(line.limit_minor, "PHP", { compact: true })}</span>}
                    </span>
                  </button>
                )
              })}
              <AddCategory kind={kind} onCreated={(c) => setCategoryId(c.id)} />
            </div>
            {subcategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {subcategories.map((sub) => (
                  <Chip key={sub.id} active={sub.id === subcategoryId} onClick={() => setSubcategoryId(sub.id === subcategoryId ? "" : sub.id)}>{sub.name}</Chip>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={date === todayISO()} onClick={() => setDate(todayISO())}>Today</Chip>
          <Chip active={date === yesterday} onClick={() => setDate(yesterday)}>Yesterday</Chip>
          <Chip active={date !== todayISO() && date !== yesterday} onClick={() => dateRef.current?.showPicker?.()} className="relative gap-1.5">
            <CalendarDays className="mr-1.5 inline size-3.5" />
            {date !== todayISO() && date !== yesterday ? format(new Date(`${date}T00:00:00`), "MMM d, yyyy") : "Pick date"}
            <input ref={dateRef} type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="pointer-events-none absolute inset-0 opacity-0" tabIndex={-1} aria-label="Transaction date" />
          </Chip>
          <button type="button" onClick={() => onMoreDetails({
            type, amount_minor: amountMinor || undefined, occurred_on: date, account_id: fromId || undefined,
            to_account_id: toId || null, category_id: categoryId || null, subcategory_id: subcategoryId || null, notes: note || null,
          })} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-[0.8125rem] font-medium text-primary hover:opacity-80">
            <SlidersHorizontal className="size-3.5" /> More details
          </button>
        </div>
      </div>

      <div className="border-t bg-popover px-3 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {keypad && (
          <div className="grid grid-cols-4 gap-1.5 pb-2.5 select-none-touch">
            {KEYS.map(({ key, label, tone }) => (
              <button key={key} type="button" onClick={() => press(key)} aria-label={key === "⌫" ? "Delete" : key === "AC" ? "Clear" : key}
                className={cn("pressable flex h-12 items-center justify-center rounded-lg text-[1.375rem] transition-colors sm:h-11",
                  tone === "digit" && "bg-muted/80 text-foreground hover:bg-muted",
                  tone === "op" && "bg-muted/80 text-primary hover:bg-muted",
                  tone === "danger" && "bg-muted/80 text-base font-medium text-muted-foreground hover:bg-muted",
                  tone === "primary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
                {label ?? key}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setKeypad((k) => !k)} aria-label={keypad ? "Hide keypad" : "Show keypad"} aria-pressed={keypad}
            className="pressable flex size-12 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-accent/60 aria-pressed:text-foreground">
            <Grid3x3 className="size-5" strokeWidth={2} />
          </button>
          {type !== "transfer" && <AccountPicker label="Account" accounts={active} value={fromId} onChange={setAccountId} />}
          <button type="button" onClick={save} disabled={!canSave || saving}
            className={cn("pressable h-12 shrink-0 rounded-lg bg-primary px-5 text-[0.9375rem] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40", type === "transfer" && "flex-1")}>
            {saving ? "Saving…" : `Save ${typeLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}
