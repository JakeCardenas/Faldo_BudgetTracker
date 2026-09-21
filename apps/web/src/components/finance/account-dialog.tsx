"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { AccountCard } from "@/components/wallet/account-card"
import { api, ApiError } from "@/lib/api"
import { ACCOUNT_PALETTE, ACCOUNT_TEMPLATES } from "@/lib/account-templates"
import { ACCOUNT_TYPE_LABELS, minorToInput, toMinor } from "@/lib/format"
import { cn } from "@/lib/utils"
import { invalidateFinancialData } from "@/lib/queries"
import type { Account, AccountType } from "@/lib/types"

export function AccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (open: boolean) => void; account?: Account }) {
  const qc = useQueryClient()
  const [name, setName] = useState(account?.name ?? "")
  const [type, setType] = useState<AccountType>(account?.type ?? "e_wallet")
  const [customType, setCustomType] = useState(account?.custom_type ?? "")
  const [institution, setInstitution] = useState(account?.institution ?? "")
  const owed = account?.type === "credit_card"
  const [opening, setOpening] = useState(minorToInput(account ? Math.abs(account.opening_balance_minor) : null))
  const [limit, setLimit] = useState(minorToInput(account?.credit_limit_minor))
  const [spendable, setSpendable] = useState(account?.is_spendable ?? true)
  const [color, setColor] = useState(account?.color ?? ACCOUNT_PALETTE[0])
  const [last4, setLast4] = useState(account?.card_last4 ?? "")
  const [busy, setBusy] = useState(false)
  const hasCardNumber = type === "credit_card" || type === "bank" || type === "savings"
  const cardLast4 = hasCardNumber && last4.length === 4 ? last4 : null
  const openingMinorPreview = toMinor(opening || "0") ?? 0
  const preview: Account = {
    id: account?.id ?? "preview", name: name || "New account", type, custom_type: customType || null, institution: institution || null,
    currency: account?.currency ?? "PHP", opening_balance_minor: 0, balance_minor: account ? account.balance_minor : type === "credit_card" ? -openingMinorPreview : openingMinorPreview,
    is_spendable: type === "savings" || type === "credit_card" ? false : spendable, credit_limit_minor: type === "credit_card" ? toMinor(limit) : null,
    card_last4: cardLast4, color, archived: false, sort_order: 0, transaction_count: 0, last_activity_on: null, updated_at: "",
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const openingMinor = toMinor(opening || "0") ?? 0
    const signed = type === "credit_card" ? -openingMinor : openingMinor
    if (hasCardNumber && last4 && last4.length !== 4) {
      toast.error("Enter exactly the last 4 digits, or leave it empty.")
      return
    }
    setBusy(true)
    try {
      if (account) {
        await api.patch(`/accounts/${account.id}`, { name, institution: institution || null, custom_type: customType || null,
          opening_balance_minor: signed, is_spendable: spendable, credit_limit_minor: type === "credit_card" ? toMinor(limit) : null, card_last4: cardLast4, color })
      } else {
        await api.post("/accounts", { name, type, institution: institution || null, custom_type: type === "custom" ? customType : null,
          opening_balance_minor: signed, is_spendable: type === "savings" || type === "credit_card" ? false : spendable,
          credit_limit_minor: type === "credit_card" ? toMinor(limit) : null, card_last4: cardLast4, color })
      }
      await invalidateFinancialData(qc)
      toast.success(account ? "Account updated" : "Account added")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save the account.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>Faldo uses manual accounts. It never connects to your bank or e-wallet.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center rounded-2xl bg-muted/50 py-4" aria-hidden>
          <AccountCard account={preview} size="md" static />
        </div>
        <form onSubmit={submit} className="space-y-4">
          {!account && (
            <div className="space-y-2">
              <Label>Quick start</Label>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
                {ACCOUNT_TEMPLATES.map((t) => (
                  <button key={t.name} type="button" onClick={() => {
                    setName(t.name); setType(t.type); setInstitution(t.institution); setColor(t.color)
                    setSpendable(t.type !== "savings" && t.type !== "credit_card")
                  }} className={cn("pressable flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs font-medium hover:bg-accent/60", name === t.name && "border-primary/45 bg-secondary hover:bg-secondary")}>
                    <span className="size-6 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Name</Label>
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="e.g. GCash" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AccountType)} disabled={!!account}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-inst">Institution</Label>
              <Input id="acc-inst" value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={60} placeholder="e.g. BPI" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Card color</Label>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_PALETTE.map((c) => (
                <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                  className={cn("size-8 rounded-full ring-offset-2 ring-offset-background transition", color === c && "ring-2 ring-primary")} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {type === "custom" && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-custom">Custom type</Label>
              <Input id="acc-custom" value={customType} onChange={(e) => setCustomType(e.target.value)} maxLength={40} placeholder="e.g. Coop savings" required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="acc-open">{type === "credit_card" ? "Amount owed when you started tracking" : "Starting balance"}</Label>
            <AmountInput id="acc-open" value={opening} onValueChange={setOpening} placeholder="0" />
            {(owed || type === "credit_card") && <p className="text-xs text-muted-foreground">Card balances count against your total balance.</p>}
          </div>
          {type === "credit_card" && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-limit">Credit limit</Label>
              <AmountInput id="acc-limit" value={limit} onValueChange={setLimit} placeholder="Optional" />
            </div>
          )}
          {hasCardNumber && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-last4">Last 4 digits <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="acc-last4" value={last4} onChange={(e) => setLast4(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} placeholder="4821" className="tabular w-28 tracking-[0.2em]" />
              <p className="text-xs text-muted-foreground">Only so you can tell your cards apart. Never enter a full card number, CVV, PIN or password.</p>
            </div>
          )}
          {type !== "credit_card" && type !== "savings" && (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">Spendable money</span>
                <span className="block text-xs text-muted-foreground">Include in safe-to-spend and forecasts</span>
              </span>
              <Switch checked={spendable} onCheckedChange={setSpendable} />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : account ? "Save" : "Add account"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
