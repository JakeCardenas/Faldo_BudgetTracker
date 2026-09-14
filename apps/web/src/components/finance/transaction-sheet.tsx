"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { CategoryIcon } from "@/components/finance/category-icon"
import { TransactionForm } from "@/components/finance/transaction-form"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate, formatMoney } from "@/lib/format"
import { useDeleteTransaction, useSaveTransaction } from "@/lib/queries"
import type { Transaction } from "@/lib/types"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Entered manually", natural_language: "Added by describing it", receipt: "Scanned from a receipt",
  recurring: "Recurring payment", seed: "Imported sample data",
}

export function TransactionSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { data: t, isLoading } = useQuery({
    queryKey: ["transactions", "detail", id],
    queryFn: () => api.get<Transaction>(`/transactions/${id}`),
    enabled: !!id,
  })
  const save = useSaveTransaction()
  const remove = useDeleteTransaction()
  const close = () => { setEditing(false); onOpenChange(false) }

  return (
    <Sheet open={!!id} onOpenChange={(open) => { if (!open) close() }}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{editing ? "Edit transaction" : "Transaction"}</SheetTitle>
          <SheetDescription className="sr-only">Transaction details</SheetDescription>
        </SheetHeader>
        {isLoading || !t ? (
          <div className="space-y-3 p-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : editing ? (
          <div className="p-5">
            <TransactionForm
              initial={{ ...t, items: t.items.map((i) => ({ name: i.name, amount_minor: i.amount_minor })) }}
              busy={save.isPending}
              onCancel={() => setEditing(false)}
              submitLabel="Save changes"
              onSubmit={(input) => save.mutate({ id: t.id, data: input }, {
                onSuccess: () => { toast.success("Changes saved"); setEditing(false) },
                onError: (e) => toast.error(e.message),
              })}
            />
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="flex items-center gap-3">
              <CategoryIcon icon={t.type === "transfer" ? "transfer" : t.category_icon} color={t.category_color} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{t.type === "transfer" ? "Transfer" : t.merchant ?? t.category_name ?? "Transaction"}</p>
                <p className="text-xs text-muted-foreground">{formatDate(t.occurred_on, "EEEE, MMMM d, yyyy")}</p>
              </div>
            </div>
            <p className={`tabular text-4xl font-semibold tracking-tight ${t.type === "income" ? "text-emerald" : ""}`}>
              {formatMoney(t.type === "expense" ? -t.amount_minor : t.amount_minor, t.currency, { signed: t.type === "income" })}
            </p>
            <div className="divide-y rounded-xl border px-4">
              <Row label="Type">{t.type[0].toUpperCase() + t.type.slice(1)}</Row>
              <Row label={t.type === "transfer" ? "From" : "Account"}>{t.account_name}</Row>
              {t.to_account_name && <Row label="To">{t.to_account_name}</Row>}
              {t.category_name && <Row label="Category">{t.category_name}{t.subcategory_name && ` · ${t.subcategory_name}`}</Row>}
              {t.payment_method && <Row label="Payment method">{t.payment_method}</Row>}
              {t.tags.length > 0 && <Row label="Tags">{t.tags.join(", ")}</Row>}
              <Row label="Source">{SOURCE_LABELS[t.source] ?? t.source}</Row>
            </div>
            {t.items.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Items</p>
                <ul className="divide-y rounded-xl border px-4">
                  {t.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 py-2.5 text-sm">
                      <span>{item.name}{Number(item.quantity) !== 1 && <span className="text-muted-foreground"> × {Number(item.quantity)}</span>}</span>
                      <span className="tabular">{formatMoney(item.amount_minor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {t.notes && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Notes</p>
                <p className="text-sm">{t.notes}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
              <Button variant="destructive" className="flex-1" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>
            </div>
          </div>
        )}
      </SheetContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>Balances, budgets and insights will be recalculated. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => t && remove.mutate(t.id, {
              onSuccess: () => { toast.success("Transaction deleted"); close() },
              onError: (e) => toast.error(e.message),
            })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
