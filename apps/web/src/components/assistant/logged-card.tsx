"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, ChevronRight, CircleAlert, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { DraftCard } from "@/components/capture/draft-card"
import { CategoryIcon } from "@/components/finance/category-icon"
import { api, ApiError } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { invalidateFinancialData } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { CaptureDraft, Transaction, TransactionInput } from "@/lib/types"
import { cn } from "@/lib/utils"

const QUESTION_START = /^(what|how|why|when|where|who|which|can|could|should|would|will|do|does|did|is|am|are|was|were|show|list|compare|give|tell|help|explain|summari[sz]e|analy[sz]e|forecast|predict|any|have|has)\b/i

export function looksLikeLogging(text: string) {
  const value = text.trim()
  if (!/\d/.test(value) || value.endsWith("?")) return false
  return !QUESTION_START.test(value)
}

export function draftToInput(draft: CaptureDraft): TransactionInput {
  return {
    type: draft.type, amount_minor: draft.amount_minor ?? 0, occurred_on: draft.occurred_on, account_id: draft.account_id ?? "",
    to_account_id: draft.to_account_id, merchant: draft.merchant, category_id: draft.category_id, subcategory_id: draft.subcategory_id,
    payment_method: draft.payment_method, notes: draft.notes, tags: draft.tags,
    items: draft.items.map((i) => ({ name: i.name, quantity: i.quantity, amount_minor: i.amount_minor })),
  }
}

function describe(t: Transaction) {
  const type = t.type === "income" ? "Income" : t.type === "transfer" ? "Transfer" : "Expense"
  if (t.type === "transfer") return <><b>{type}:</b> {formatMoney(t.amount_minor)} from <b>{t.account_name}</b> to <b>{t.to_account_name}</b></>
  return <><b>{type}:</b> {formatMoney(t.amount_minor)}{t.category_name && <> in <b>{t.category_name}</b></>} {t.type === "income" ? "to" : "from"} <b>{t.account_name}</b>{t.merchant || t.notes ? ` for ${t.merchant ?? t.notes}` : ""}</>
}

export function LoggedCard({ transactions, onOpen }: { transactions: Transaction[]; onOpen: (id: string) => void }) {
  const qc = useQueryClient()
  const [state, setState] = useState<"logged" | "cancelling" | "cancelled">("logged")
  async function cancel() {
    play("undo")
    setState("cancelling")
    try {
      await Promise.all(transactions.map((t) => api.delete(`/transactions/${t.id}`)))
      await invalidateFinancialData(qc)
      setState("cancelled")
    } catch {
      setState("logged")
      toast.error("Couldn't cancel that.")
    }
  }
  const cancelled = state === "cancelled"
  return (
    <div className={cn("space-y-3 rounded-xl border bg-card p-4", cancelled && "opacity-70")}>
      <p className={cn("flex items-center gap-1.5 text-[0.9375rem] font-medium", !cancelled && "text-primary")}>
        {cancelled ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
        {cancelled ? "Removed" : "Logged"} {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
      </p>
      <ul className="space-y-1 text-sm leading-relaxed text-foreground/85 [&_b]:font-medium [&_b]:text-foreground">{transactions.map((t) => <li key={t.id}>{describe(t)}</li>)}</ul>
      {!cancelled && (
        <>
          <div className="space-y-1.5">
            {transactions.map((t) => (
              <button key={t.id} type="button" onClick={() => onOpen(t.id)} className="pressable flex w-full items-center gap-3 rounded-lg border p-2.5 text-left hover:bg-accent/60">
                <CategoryIcon icon={t.category_icon} color={t.category_color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.category_name ?? (t.type === "transfer" ? "Transfer" : "Uncategorized")}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.type === "income" ? "Income" : t.type === "transfer" ? "Transfer" : "Expense"}, {formatMoney(t.amount_minor)} {t.type === "income" ? "to" : "from"} {t.account_name}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground/60" />
              </button>
            ))}
          </div>
          <button type="button" onClick={cancel} disabled={state === "cancelling"} className="pressable inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            {state === "cancelling" ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />} Cancel
          </button>
        </>
      )}
    </div>
  )
}

export function ReviewCard({ drafts: initial, onLogged }: { drafts: CaptureDraft[]; onLogged: (transactions: Transaction[]) => void }) {
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState(initial)
  const [busy, setBusy] = useState(false)
  const blocking = drafts.some((d) => d.issues.some((i) => i.blocking) || !d.amount_minor || !d.account_id)
  async function save() {
    setBusy(true)
    try {
      const created = await api.post<Transaction[]>("/capture/confirm", { transactions: drafts.map(draftToInput) })
      await invalidateFinancialData(qc)
      play("success")
      onLogged(created)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-[0.9375rem] font-medium text-warning"><CircleAlert className="size-4" /> Quick check</p>
      <p className="text-sm text-muted-foreground">I read this, but a detail needs your confirmation before I log it.</p>
      {drafts.map((draft, i) => (
        <DraftCard key={i} draft={draft} onChange={(next) => setDrafts(drafts.map((d, idx) => (idx === i ? next : d)))} />
      ))}
      <button type="button" onClick={save} disabled={busy || blocking} className="pressable h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
        {busy ? "Logging…" : "Log it"}
      </button>
    </div>
  )
}
