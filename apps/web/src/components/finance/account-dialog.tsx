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
import { api, ApiError } from "@/lib/api"
import { ACCOUNT_TYPE_LABELS, minorToInput, toMinor } from "@/lib/format"
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
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const openingMinor = toMinor(opening || "0") ?? 0
    const signed = type === "credit_card" ? -openingMinor : openingMinor
    setBusy(true)
    try {
      if (account) {
        await api.patch(`/accounts/${account.id}`, { name, institution: institution || null, custom_type: customType || null,
          opening_balance_minor: signed, is_spendable: spendable, credit_limit_minor: type === "credit_card" ? toMinor(limit) : null })
      } else {
        await api.post("/accounts", { name, type, institution: institution || null, custom_type: type === "custom" ? customType : null,
          opening_balance_minor: signed, is_spendable: type === "savings" || type === "credit_card" ? false : spendable,
          credit_limit_minor: type === "credit_card" ? toMinor(limit) : null })
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>Faldo uses manual accounts. It never connects to your bank or e-wallet.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
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
          {type !== "credit_card" && type !== "savings" && (
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
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
