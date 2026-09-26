"use client"

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeftRight, Banknote, Check, ChevronLeft, ChevronRight, CreditCard, Landmark, Loader2, PiggyBank, Search, Smartphone, Wallet, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { IosSheet } from "@/components/ios/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AccountCard, ProviderMark } from "@/components/wallet/account-card"
import { api, ApiError } from "@/lib/api"
import { ACCOUNT_PALETTE } from "@/lib/account-templates"
import { minorToInput, toMinor } from "@/lib/format"
import { providersFor, type Provider } from "@/lib/providers"
import { invalidateFinancialData, useMe } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Account, AccountType } from "@/lib/types"
import { cn } from "@/lib/utils"

/** What people pick first. Debit cards draw from a bank account, so Faldo tracks them as one. */
type Choice = "cash" | "bank" | "e_wallet" | "savings" | "debit" | "credit_card" | "custom"

const CHOICES: { id: Choice; label: string; hint: string; icon: LucideIcon; type: AccountType }[] = [
  { id: "cash", label: "Cash", hint: "Your wallet", icon: Banknote, type: "cash" },
  { id: "e_wallet", label: "E-wallet", hint: "GCash, Maya and more", icon: Smartphone, type: "e_wallet" },
  { id: "bank", label: "Bank account", hint: "BDO, BPI and more", icon: Landmark, type: "bank" },
  { id: "savings", label: "Savings", hint: "Money set aside", icon: PiggyBank, type: "savings" },
  { id: "debit", label: "Debit card", hint: "Spends from a bank account", icon: ArrowLeftRight, type: "bank" },
  { id: "credit_card", label: "Credit card", hint: "Tracks what you owe", icon: CreditCard, type: "credit_card" },
  { id: "custom", label: "Something else", hint: "Coop, alkansya, paluwagan", icon: Wallet, type: "custom" },
]

const WITH_PROVIDER: Choice[] = ["bank", "e_wallet", "savings", "debit", "credit_card"]

type Step = "type" | "provider" | "details"

/**
 * Add or edit a manually tracked account as a short, native-feeling sheet:
 * type, then provider (for banks, e-wallets and cards), then details. Editing opens on details.
 */
export function AccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (open: boolean) => void; account?: Account }) {
  const qc = useQueryClient()
  const editing = Boolean(account)
  const [step, setStep] = useState<Step>(editing ? "details" : "type")
  const [choice, setChoice] = useState<Choice>((account?.type as Choice) ?? "e_wallet")
  const [query, setQuery] = useState("")
  const [name, setName] = useState(account?.name ?? "")
  const [institution, setInstitution] = useState(account?.institution ?? "")
  const [customType, setCustomType] = useState(account?.custom_type ?? "")
  const [opening, setOpening] = useState(minorToInput(account ? Math.abs(account.opening_balance_minor) : null))
  const [limit, setLimit] = useState(minorToInput(account?.credit_limit_minor))
  const [spendable, setSpendable] = useState(account?.is_spendable ?? true)
  const [color, setColor] = useState(account?.color ?? ACCOUNT_PALETTE[0])
  const [last4, setLast4] = useState(account?.card_last4 ?? "")
  const [busy, setBusy] = useState(false)

  const meta = CHOICES.find((c) => c.id === choice) ?? CHOICES[0]
  const type: AccountType = account?.type ?? meta.type
  const providerKind: AccountType = choice === "debit" ? "bank" : meta.type
  const allProviders = useMemo(() => providersFor(providerKind), [providerKind])
  // An existing account keeps its own currency; a new one is in the user's.
  const userCurrency = useMe().data?.settings.currency
  const currency = account?.currency ?? userCurrency ?? "PHP"
  const providers = allProviders.filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()))
  const hasCardNumber = type === "credit_card" || type === "bank" || type === "savings"
  const cardLast4 = hasCardNumber && last4.length === 4 ? last4 : null
  const openingMinor = toMinor(opening || "0") ?? 0
  const spendableValue = type === "savings" || type === "credit_card" ? false : spendable

  const preview: Account = {
    id: account?.id ?? "preview", name: name || meta.label, type, custom_type: customType || null, institution: institution || null,
    currency, opening_balance_minor: 0,
    balance_minor: account ? account.balance_minor : type === "credit_card" ? -openingMinor : openingMinor,
    is_spendable: spendableValue, credit_limit_minor: type === "credit_card" ? toMinor(limit) : null,
    card_last4: cardLast4, color, archived: false, sort_order: 0, transaction_count: 0, last_activity_on: null, updated_at: "",
  }

  function pickChoice(next: Choice) {
    play("tap")
    const c = CHOICES.find((x) => x.id === next)!
    setChoice(next)
    setQuery("")
    setSpendable(c.type !== "savings" && c.type !== "credit_card")
    if (WITH_PROVIDER.includes(next)) {
      setStep("provider")
      return
    }
    setInstitution("")
    setName(next === "cash" ? "Cash" : "")
    setColor(next === "cash" ? "#2c7549" : ACCOUNT_PALETTE[4])
    setStep("details")
  }

  function pickProvider(provider: Provider | null) {
    play("tap")
    if (provider) {
      setInstitution(provider.name)
      setColor(provider.color)
      setName(choice === "debit" ? `${provider.name} Debit` : choice === "credit_card" ? `${provider.name} Card`
        : choice === "savings" && provider.kinds.includes("credit_card") ? `${provider.name} Savings` : provider.name)
    } else {
      setInstitution(query.trim())
      setName(query.trim())
      setColor(ACCOUNT_PALETTE[0])
    }
    setStep("details")
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (hasCardNumber && last4 && last4.length !== 4) {
      toast.error("Enter exactly the last 4 digits, or leave it empty.")
      return
    }
    const signed = type === "credit_card" ? -openingMinor : openingMinor
    setBusy(true)
    try {
      const body = {
        name: name.trim(), institution: institution.trim() || null, opening_balance_minor: signed, is_spendable: spendableValue,
        credit_limit_minor: type === "credit_card" ? toMinor(limit) : null, card_last4: cardLast4, color,
      }
      if (account) await api.patch(`/accounts/${account.id}`, { ...body, custom_type: customType || null })
      else await api.post("/accounts", { ...body, type, custom_type: type === "custom" ? customType || null : null })
      await invalidateFinancialData(qc)
      toast.success(account ? "Account updated" : "Account added")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save the account.")
    } finally {
      setBusy(false)
    }
  }

  const title = editing ? "Edit account" : step === "type" ? "Add an account"
    : step === "provider" ? (choice === "e_wallet" ? "Which e-wallet?" : "Which bank?") : "Account details"

  return (
    <IosSheet open={open} onOpenChange={onOpenChange} title={title} size="sm"
      description={step === "type" ? "You update these yourself. Faldo never connects to your bank or e-wallet." : undefined}
      footer={step === "details" ? (
        <Button type="submit" form="account-form" size="lg" className="w-full" disabled={busy || !name.trim()}>
          {busy && <Loader2 className="animate-spin" />} {editing ? "Save changes" : "Add account"}
        </Button>
      ) : undefined}>
      {!editing && step !== "type" && (
        <button type="button" onClick={() => { play("tap"); setStep(step === "details" && WITH_PROVIDER.includes(choice) ? "provider" : "type") }}
          className="-mt-1 mb-3 -ml-1 inline-flex items-center gap-0.5 rounded-full py-1 pr-2 text-sm font-medium text-primary">
          <ChevronLeft className="size-4" /> Back
        </button>
      )}

      {step === "type" && (
        <ul className="overflow-hidden rounded-2xl bg-muted/40 dark:bg-muted/50">
          {CHOICES.map((c) => {
            const Icon = c.icon
            return (
              <li key={c.id} className="border-b border-border/60 last:border-b-0">
                <button type="button" onClick={() => pickChoice(c.id)}
                  className="flex w-full min-w-0 items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/70">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-foreground/80 shadow-(--shadow-card)"><Icon className="size-[1.05rem]" strokeWidth={2} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-medium">{c.label}</span>
                    <span className="block truncate text-[0.8125rem] text-muted-foreground">{c.hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {step === "provider" && (
        <div className="space-y-3">
          {allProviders.length > 6 && (
            <label className="flex h-11 items-center gap-2 rounded-full bg-muted px-4">
              <Search className="size-4 text-muted-foreground" />
              <span className="sr-only">Search</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm" />
            </label>
          )}
          <ul className="overflow-hidden rounded-2xl bg-muted/40 dark:bg-muted/50">
            {providers.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pickProvider(p)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/70">
                  <ProviderMark provider={p} fallback={meta.icon} />
                  <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{p.name}</span>
                  <ChevronRight className="size-4 text-muted-foreground/50" />
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => pickProvider(null)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/70">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground"><Wallet className="size-4" /></span>
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{query.trim() ? `Use "${query.trim()}"` : "It's not listed"}</span>
                <ChevronRight className="size-4 text-muted-foreground/50" />
              </button>
            </li>
          </ul>
        </div>
      )}

      {step === "details" && (
        <form id="account-form" onSubmit={submit} className="space-y-4">
          <div className="flex justify-center rounded-2xl bg-muted/50 py-4" aria-hidden>
            <AccountCard account={preview} size="md" static />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Name</Label>
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60}
              placeholder={choice === "custom" ? "e.g. Coop savings" : "e.g. GCash"} />
          </div>
          {type === "custom" && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-custom">What kind of account?</Label>
              <Input id="acc-custom" value={customType} onChange={(e) => setCustomType(e.target.value)} maxLength={40} placeholder="e.g. Cooperative" />
            </div>
          )}
          <div className={cn("grid gap-3", type === "credit_card" ? "grid-cols-2" : "grid-cols-1")}>
            <div className="space-y-1.5">
              <Label htmlFor="acc-open">{type === "credit_card" ? "Amount owed now" : editing ? "Starting balance" : "Balance now"}</Label>
              <AmountInput currency={currency} id="acc-open" value={opening} onValueChange={setOpening} placeholder="0" />
            </div>
            {type === "credit_card" && (
              <div className="space-y-1.5">
                <Label htmlFor="acc-limit">Credit limit</Label>
                <AmountInput currency={currency} id="acc-limit" value={limit} onValueChange={setLimit} placeholder="Optional" />
              </div>
            )}
          </div>
          {editing && <p className="-mt-2 text-xs text-muted-foreground">The balance when you started tracking. Transactions add up from there.</p>}
          {hasCardNumber && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-last4">Last 4 digits <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="acc-last4" value={last4} onChange={(e) => setLast4(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} placeholder="4821" className="tabular w-28 tracking-[0.2em]" />
              <p className="text-xs text-muted-foreground">Only so you can tell your cards apart. Never enter a full card number, CVV, PIN or password.</p>
            </div>
          )}
          {type !== "credit_card" && type !== "savings" && (
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Counts toward Safe to Spend</span>
                <span className="block text-xs text-muted-foreground">Turn off for money you don&apos;t spend day to day</span>
              </span>
              <Switch checked={spendable} onCheckedChange={setSpendable} />
            </label>
          )}
          <div className="space-y-2">
            <Label>Card colour</Label>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([color, ...ACCOUNT_PALETTE])).slice(0, 10).map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                  className="relative size-9 rounded-full ring-offset-2 ring-offset-popover transition aria-pressed:ring-2 aria-pressed:ring-primary" style={{ backgroundColor: c }}>
                  {color === c && <Check className="absolute inset-0 m-auto size-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        </form>
      )}
    </IosSheet>
  )
}
