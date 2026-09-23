"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { AmountInput } from "@/components/finance/amount-input"
import { BalanceNote } from "@/components/finance/balance-note"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatMoney, minorToInput, toMinor, todayISO } from "@/lib/format"
import { useAccounts, useCategories } from "@/lib/queries"
import type { TransactionInput, TransactionType } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface TransactionFormValues {
  type: TransactionType
  amount_minor: number | null
  occurred_on: string
  account_id: string | null
  to_account_id: string | null
  merchant: string | null
  category_id: string | null
  subcategory_id: string | null
  payment_method: string | null
  notes: string | null
  tags: string[]
  items: { name: string; amount_minor: number }[]
}

export const EMPTY_FORM: TransactionFormValues = {
  type: "expense", amount_minor: null, occurred_on: todayISO(), account_id: null, to_account_id: null, merchant: null,
  category_id: null, subcategory_id: null, payment_method: null, notes: null, tags: [], items: [],
}

const NONE = "__none__"

function Field({ label, htmlFor, children, highlight, hint }: { label: string; htmlFor?: string; children: React.ReactNode; highlight?: boolean; hint?: string }) {
  return (
    <div className={cn("space-y-1.5 rounded-lg", highlight && "-m-1.5 bg-warning-soft/70 p-1.5")}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-warning">{hint}</p>}
    </div>
  )
}

export function TransactionForm({ initial, saved, onSubmit, submitLabel = "Save transaction", busy, onCancel, highlights = {}, extraActions }: {
  initial?: Partial<TransactionFormValues>
  /** Editing a transaction already recorded, so its amount already came out of its account. */
  saved?: boolean
  onSubmit: (input: TransactionInput) => void
  submitLabel?: string
  busy?: boolean
  onCancel?: () => void
  highlights?: Record<string, string>
  extraActions?: React.ReactNode
}) {
  const start = { ...EMPTY_FORM, ...initial }
  const [type, setType] = useState<TransactionType>(start.type)
  const [amount, setAmount] = useState(minorToInput(start.amount_minor))
  const [date, setDate] = useState(start.occurred_on)
  const [accountId, setAccountId] = useState(start.account_id ?? "")
  const [toAccountId, setToAccountId] = useState(start.to_account_id ?? "")
  const [merchant, setMerchant] = useState(start.merchant ?? "")
  const [categoryId, setCategoryId] = useState(start.category_id ?? "")
  const [subcategoryId, setSubcategoryId] = useState(start.subcategory_id ?? "")
  const [payment, setPayment] = useState(start.payment_method ?? "")
  const [notes, setNotes] = useState(start.notes ?? "")
  const [tags, setTags] = useState(start.tags.join(", "))
  const [items, setItems] = useState(start.items.map((i) => ({ name: i.name, amount: minorToInput(i.amount_minor) })))
  const [error, setError] = useState<string | null>(null)

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const kind = type === "income" ? "income" : "expense"
  const topCategories = useMemo(() => categories.filter((c) => c.kind === kind && !c.parent_id), [categories, kind])
  const subcategories = useMemo(() => categories.filter((c) => c.parent_id === categoryId), [categories, categoryId])
  const activeAccounts = accounts.filter((a) => !a.archived)

  const itemTotal = items.reduce((sum, i) => sum + (toMinor(i.amount) ?? 0), 0)
  const amountMinor = toMinor(amount)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!amountMinor || amountMinor <= 0) return setError("Enter an amount greater than zero.")
    if (!accountId) return setError("Choose an account.")
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) return setError("Choose a different destination account.")
    const parsedItems = items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), amount_minor: toMinor(i.amount) ?? 0 }))
    if (parsedItems.reduce((s, i) => s + i.amount_minor, 0) > amountMinor) return setError("Items add up to more than the total.")
    onSubmit({
      type,
      amount_minor: amountMinor,
      occurred_on: date,
      account_id: accountId,
      to_account_id: type === "transfer" ? toAccountId : null,
      merchant: type === "transfer" ? null : merchant.trim() || null,
      category_id: type === "transfer" ? null : categoryId || null,
      subcategory_id: type === "transfer" ? null : subcategoryId || null,
      payment_method: payment.trim() || null,
      notes: notes.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      items: type === "transfer" ? [] : parsedItems,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ToggleGroup type="single" value={type} onValueChange={(v) => { if (v) { setType(v as TransactionType); setCategoryId(""); setSubcategoryId("") } }}
        variant="outline" className="grid w-full grid-cols-3">
        <ToggleGroupItem value="expense">Expense</ToggleGroupItem>
        <ToggleGroupItem value="income">Income</ToggleGroupItem>
        <ToggleGroupItem value="transfer">Transfer</ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" htmlFor="tx-amount" highlight={!!highlights.amount_minor} hint={highlights.amount_minor}>
          <AmountInput id="tx-amount" value={amount} onValueChange={setAmount} placeholder="0.00" autoFocus={!initial?.amount_minor} />
        </Field>
        <Field label="Date" htmlFor="tx-date" highlight={!!highlights.occurred_on} hint={highlights.occurred_on}>
          <Input id="tx-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={type === "transfer" ? "From account" : "Account"} highlight={!!highlights.account_id} hint={highlights.account_id}>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger>
            <SelectContent>{activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
          {type !== "income" && <BalanceNote account={activeAccounts.find((a) => a.id === accountId)} amountMinor={amountMinor ?? 0}
            returning={saved && start.account_id === accountId && start.type !== "income" ? start.amount_minor ?? 0 : 0} />}
        </Field>
        {type === "transfer" ? (
          <Field label="To account" highlight={!!highlights.to_account_id} hint={highlights.to_account_id}>
            <Select value={toAccountId} onValueChange={setToAccountId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger>
              <SelectContent>{activeAccounts.filter((a) => a.id !== accountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label={type === "income" ? "Source" : "Merchant"} htmlFor="tx-merchant">
            <Input id="tx-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={type === "income" ? "e.g. Employer" : "e.g. Jollibee"} maxLength={80} />
          </Field>
        )}
      </div>

      {type !== "transfer" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" highlight={!!highlights.category_id} hint={highlights.category_id}>
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId("") }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose category" /></SelectTrigger>
              <SelectContent>{topCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subcategory">
            <Select value={subcategoryId || NONE} onValueChange={(v) => setSubcategoryId(v === NONE ? "" : v)} disabled={!subcategories.length}>
              <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {subcategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment method" htmlFor="tx-payment">
          <Input id="tx-payment" value={payment} onChange={(e) => setPayment(e.target.value)} placeholder="e.g. QR Ph, debit card" maxLength={40} />
        </Field>
        <Field label="Tags" htmlFor="tx-tags">
          <Input id="tx-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma separated" />
        </Field>
      </div>

      {type !== "transfer" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">Items {items.length > 0 && <span className="tabular">· {formatMoney(itemTotal)}</span>}</Label>
            <Button type="button" variant="ghost" size="xs" onClick={() => setItems([...items, { name: "", amount: "" }])}>
              <Plus /> Add item
            </Button>
          </div>
          {items.length > 0 && (
            <div className="space-y-2 rounded-xl border bg-muted/40 p-2">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <Input aria-label={`Item ${index + 1} name`} value={item.name} placeholder="Item name" className="bg-card"
                    onChange={(e) => setItems(items.map((it, i) => (i === index ? { ...it, name: e.target.value } : it)))} />
                  <AmountInput aria-label={`Item ${index + 1} amount`} value={item.amount} className="w-32 shrink-0" placeholder="0"
                    onValueChange={(v) => setItems(items.map((it, i) => (i === index ? { ...it, amount: v } : it)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove item" onClick={() => setItems(items.filter((_, i) => i !== index))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {amountMinor !== null && itemTotal > 0 && itemTotal !== amountMinor && (
                <p className="px-1 text-xs text-muted-foreground">
                  {itemTotal < amountMinor ? `${formatMoney(amountMinor - itemTotal)} not itemized` : "Items exceed the total"}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Field label="Notes" htmlFor="tx-notes">
        <Textarea id="tx-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} placeholder="Optional" />
      </Field>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {extraActions}
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={busy} className="min-w-36">{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  )
}
