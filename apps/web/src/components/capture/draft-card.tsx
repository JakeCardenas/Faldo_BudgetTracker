"use client"

import { AlertCircle, CalendarDays, Landmark, Pencil, Sparkles, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDate, formatMoney } from "@/lib/format"
import type { CaptureDraft } from "@/lib/types"
import { cn } from "@/lib/utils"

function Chip({ icon: Icon, children, warn }: { icon: typeof Tag; children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", warn ? "border-warning/30 bg-warning-soft text-warning" : "bg-card text-foreground")}>
      <Icon className="size-3.5 opacity-70" />
      {children}
    </span>
  )
}

export function DraftCard({ draft, onChange, onEdit }: { draft: CaptureDraft; onChange: (draft: CaptureDraft) => void; onEdit: () => void }) {
  const fields = new Set(draft.issues.map((i) => i.field))

  function choose(field: string, id: string, label: string) {
    const next: CaptureDraft = { ...draft, issues: draft.issues.filter((i) => i.field !== field) }
    if (field === "account_id") Object.assign(next, { account_id: id, account_name: label })
    if (field === "to_account_id") Object.assign(next, { to_account_id: id, to_account_name: label })
    if (field === "category_id") Object.assign(next, { category_id: id, category_name: label, subcategory_id: null, subcategory_name: null })
    next.needs_confirmation = next.issues.length > 0
    onChange(next)
  }

  const typeLabel = draft.type === "income" ? "Income" : draft.type === "transfer" ? "Transfer" : "Expense"
  const title = draft.type === "transfer" ? `${draft.account_name ?? "?"} → ${draft.to_account_name ?? "?"}` : draft.merchant ?? draft.category_name ?? typeLabel

  return (
    <div className="animate-rise space-y-3 rounded-2xl border bg-card p-4 shadow-(--shadow-card)">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{typeLabel}</p>
          <p className="truncate text-base font-semibold">{title}</p>
        </div>
        <p className={cn("tabular text-2xl font-semibold tracking-tight", draft.type === "income" && "text-emerald", !draft.amount_minor && "text-muted-foreground")}>
          {draft.amount_minor ? formatMoney(draft.type === "expense" ? -draft.amount_minor : draft.amount_minor, "PHP", { signed: draft.type === "income" }) : "₱—"}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {draft.type !== "transfer" && (
          <Chip icon={Tag} warn={fields.has("category_id")}>
            {draft.category_name ?? "No category"}{draft.subcategory_name && ` · ${draft.subcategory_name}`}
          </Chip>
        )}
        <Chip icon={Landmark} warn={fields.has("account_id")}>{draft.account_name ?? "No account"}</Chip>
        <Chip icon={CalendarDays} warn={fields.has("occurred_on")}>{formatDate(draft.occurred_on, "EEE, MMM d")}</Chip>
        {draft.learned_from_history && <Chip icon={Sparkles}>Category learned from your history</Chip>}
      </div>

      {draft.items.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-muted/50 px-3 py-2 text-sm">
          {draft.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3"><span className="truncate">{item.name}</span><span className="tabular text-muted-foreground">{formatMoney(item.amount_minor)}</span></li>
          ))}
        </ul>
      )}

      {draft.issues.length > 0 && (
        <div className="space-y-2.5 border-t pt-3">
          {draft.issues.map((issue) => (
            <div key={issue.code} className="space-y-1.5">
              <p className={cn("flex items-center gap-1.5 text-sm", issue.blocking ? "text-destructive" : "text-warning")}>
                <AlertCircle className="size-4 shrink-0" /> {issue.message}
              </p>
              {!issue.options && !issue.blocking && (
                <button type="button" onClick={() => onChange({ ...draft, issues: draft.issues.filter((i) => i.code !== issue.code), needs_confirmation: draft.issues.length > 1 })}
                  className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent">
                  {issue.code === "possible_duplicate" ? "It's a new transaction" : "Looks right"}
                </button>
              )}
              {issue.options && (
                <div className="flex flex-wrap gap-1.5">
                  {issue.options.slice(0, 8).map((option) => {
                    const selected = (issue.field === "account_id" && draft.account_id === option.id) || (issue.field === "category_id" && draft.category_id === option.id)
                    return (
                      <button key={option.id} type="button" onClick={() => choose(issue.field, option.id, option.label)}
                        className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent",
                          selected && "border-primary/50 bg-accent text-primary")}>
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onEdit}><Pencil /> Edit details</Button>
      </div>
    </div>
  )
}
