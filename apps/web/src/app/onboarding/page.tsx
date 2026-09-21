"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, Banknote, Check, CreditCard, Landmark, Loader2, PiggyBank, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { Logo } from "@/components/brand/logo"
import { Panda } from "@/components/brand/panda"
import { markWelcome } from "@/components/brand/welcome-splash"
import { AmountInput } from "@/components/finance/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError } from "@/lib/api"
import { FREQUENCY_LABELS, formatMoney, toMinor, todayISO } from "@/lib/format"
import { useCategories, useMe } from "@/lib/queries"
import type { AccountType, CaptureResult, Frequency, Me } from "@/lib/types"
import { cn } from "@/lib/utils"

type IncomeType = "salary" | "allowance" | "freelance" | "none"
const INCOME_TYPES: Record<IncomeType, { label: string; hint: string; name: string; category: string; scheduled: boolean }> = {
  salary: { label: "Salary", hint: "Paid on a schedule", name: "Salary", category: "Salary", scheduled: true },
  allowance: { label: "Allowance", hint: "From family, on a schedule", name: "Allowance", category: "Allowance", scheduled: true },
  freelance: { label: "Freelance or business", hint: "Varies, log it as it comes", name: "Income", category: "Freelance", scheduled: false },
  none: { label: "No income right now", hint: "Track what you have", name: "Income", category: "Other Income", scheduled: false },
}

const STEPS = ["Welcome", "Currency", "Account", "Income", "Goal", "Budget", "Transaction", "Assistant"]
const CURRENCIES = [
  { code: "PHP", label: "Philippine peso", symbol: "₱" },
  { code: "USD", label: "US dollar", symbol: "$" },
  { code: "SGD", label: "Singapore dollar", symbol: "S$" },
  { code: "EUR", label: "Euro", symbol: "€" },
]
const ACCOUNT_PRESETS: { name: string; type: AccountType; institution: string | null; icon: typeof Banknote }[] = [
  { name: "GCash", type: "e_wallet", institution: "GCash", icon: Smartphone },
  { name: "Maya", type: "e_wallet", institution: "Maya", icon: Smartphone },
  { name: "Cash", type: "cash", institution: null, icon: Banknote },
  { name: "Bank account", type: "bank", institution: null, icon: Landmark },
  { name: "Credit card", type: "credit_card", institution: null, icon: CreditCard },
  { name: "Savings", type: "savings", institution: null, icon: PiggyBank },
]
const BUDGET_PRESETS = ["Food & Dining", "Groceries", "Transportation", "Shopping", "Bills & Utilities", "Entertainment"]

function defaultPayday() {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const target = now.getDate() < 15 ? new Date(now.getFullYear(), now.getMonth(), 15) : now.getDate() < end.getDate() ? end : new Date(now.getFullYear(), now.getMonth() + 1, 15)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`
}

function Choice({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={cn("pressable relative rounded-2xl bg-card p-4 text-left shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent/50", selected && "bg-secondary/70 shadow-[inset_0_0_0_1.5px_var(--primary)] hover:bg-secondary/70", className)}>
      {selected && <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>}
      {children}
    </button>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: categories = [] } = useCategories()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [currency, setCurrency] = useState("PHP")
  const [accountPreset, setAccountPreset] = useState(0)
  const [accountName, setAccountName] = useState("GCash")
  const [accountBalance, setAccountBalance] = useState("")
  const [accountId, setAccountId] = useState<string | null>(null)
  const [incomeType, setIncomeType] = useState<IncomeType>("salary")
  const [income, setIncome] = useState("")
  const [frequency, setFrequency] = useState<Frequency>("semi_monthly")
  const [nextPayday, setNextPayday] = useState(defaultPayday)
  const [goalName, setGoalName] = useState("Emergency fund")
  const [goalTarget, setGoalTarget] = useState("")
  const [goalDate, setGoalDate] = useState("")
  const [budgets, setBudgets] = useState<Record<string, string>>({})
  const [txText, setTxText] = useState("")
  const [txSaved, setTxSaved] = useState<string | null>(null)

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
      next()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  const saveCurrency = () => run(async () => {
    const updated = await api.patch<Me>("/me/settings", { currency })
    qc.setQueryData(["me"], updated)
  })

  const saveAccount = () => run(async () => {
    if (accountId) return
    const preset = ACCOUNT_PRESETS[accountPreset]
    const balance = toMinor(accountBalance || "0") ?? 0
    const account = await api.post<{ id: string }>("/accounts", {
      name: accountName || preset.name, type: preset.type, institution: preset.institution,
      opening_balance_minor: preset.type === "credit_card" ? -balance : balance,
    })
    setAccountId(account.id)
    await api.patch("/me/settings", { default_account_id: account.id })
  })

  const saveIncome = () => run(async () => {
    const perPay = toMinor(income)
    const option = INCOME_TYPES[incomeType]
    if (!option.scheduled || !perPay) return
    const category = categories.find((c) => c.kind === "income" && c.name === option.category)
    await api.patch("/me/settings", { pay_frequency: frequency })
    await api.post("/recurring", { name: option.name, kind: "income", amount_minor: perPay, frequency, next_due_on: nextPayday, account_id: accountId, category_id: category?.id ?? null })
  })

  const saveGoal = () => run(async () => {
    const target = toMinor(goalTarget)
    if (!goalName || !target) return
    await api.post("/goals", { name: goalName, target_minor: target, target_date: goalDate || null, emoji: "target" })
  })

  const saveBudget = () => run(async () => {
    const lines = Object.entries(budgets).map(([name, value]) => ({ category_id: categories.find((c) => c.name === name && !c.parent_id)?.id, limit_minor: toMinor(value) }))
      .filter((l) => l.category_id && l.limit_minor)
    if (!lines.length) return
    await api.put("/budgets", { month: todayISO().slice(0, 7), lines })
  })

  async function addTransaction() {
    if (!txText.trim()) return
    setBusy(true)
    try {
      const parsed = await api.post<CaptureResult>("/capture/parse", { text: txText })
      const draft = parsed.drafts[0]
      if (!parsed.is_financial || !draft?.amount_minor) {
        toast.error("Include an amount, like “Lunch ₱250 at Jollibee”.")
        return
      }
      await api.post("/capture/confirm", { transactions: [{
        type: draft.type, amount_minor: draft.amount_minor, occurred_on: draft.occurred_on, account_id: draft.account_id ?? accountId,
        to_account_id: draft.to_account_id, merchant: draft.merchant, category_id: draft.category_id, subcategory_id: draft.subcategory_id,
        items: draft.items, tags: [],
      }] })
      setTxSaved(`${draft.merchant ?? draft.category_name ?? "Transaction"} · ${formatMoney(draft.amount_minor)} · ${draft.category_name ?? "Uncategorized"} · ${draft.account_name ?? ""}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't add that.")
    } finally {
      setBusy(false)
    }
  }

  async function finish(destination: string) {
    setBusy(true)
    const updated = await api.post<Me>("/me/onboarding/complete")
    qc.setQueryData(["me"], updated)
    markWelcome()
    router.replace(destination)
  }

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "₱"

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-5 sm:px-10">
        <Logo />
        {step > 0 && step < STEPS.length - 1 && <button onClick={() => finish("/")} className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">Skip setup</button>}
      </header>
      <div className="px-5 sm:px-10">
        <div className="mx-auto flex max-w-xl gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => <span key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", i <= step ? "bg-primary" : "bg-foreground/10")} />)}
        </div>
      </div>
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div key={step} className="animate-rise w-full max-w-xl space-y-8">
          {step === 0 && (
            <div className="space-y-7 text-center">
              <Panda pose="wave" priority sizes="160px" className="mx-auto w-36" />
              <div className="space-y-3">
                <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.035em] sm:text-[2.5rem]">Welcome to Faldo{me ? `, ${me.display_name}` : ""}</h1>
                <p className="mx-auto max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">Your money companion. Track what you spend, see what&apos;s safe to spend, and get answers from your own numbers.</p>
              </div>
              <ul className="ios-group mx-auto max-w-md divide-y divide-border/60 text-left text-[0.9375rem]">
                {["Log spending by typing it like a text", "See what's safe to spend before your next payday", "Ask questions and see the math behind every answer"].map((t) => (
                  <li key={t} className="flex items-center gap-3 px-4 py-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Check className="size-3.5" strokeWidth={2.5} /></span>{t}</li>
                ))}
              </ul>
              <Button size="lg" className="px-7" onClick={next}>Set up in 2 minutes <ArrowRight /></Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-2"><h1 className="text-2xl font-semibold tracking-[-0.025em]">Choose your currency</h1><p className="text-muted-foreground">Faldo stores exact amounts, down to the centavo.</p></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CURRENCIES.map((c) => (
                  <Choice key={c.code} selected={currency === c.code} onClick={() => setCurrency(c.code)}>
                    <span className="text-2xl font-semibold">{c.symbol}</span>
                    <span className="mt-2 block font-medium">{c.label}</span><span className="text-xs text-muted-foreground">{c.code}</span>
                  </Choice>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-2"><h1 className="text-2xl font-semibold tracking-[-0.025em]">Where do you keep your money?</h1><p className="text-muted-foreground">Start with one account. You can add the rest later. No bank connection required.</p></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ACCOUNT_PRESETS.map((p, i) => (
                  <Choice key={p.name} selected={accountPreset === i} onClick={() => { setAccountPreset(i); setAccountName(p.name) }} className="p-3.5">
                    <p.icon className="size-5 text-muted-foreground" strokeWidth={1.75} /><span className="mt-2 block text-sm font-medium">{p.name}</span>
                  </Choice>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="ob-acc">Account name</Label><Input id="ob-acc" value={accountName} onChange={(e) => setAccountName(e.target.value)} disabled={!!accountId} /></div>
                <div className="space-y-1.5"><Label htmlFor="ob-bal">{ACCOUNT_PRESETS[accountPreset].type === "credit_card" ? "Amount owed" : "Current balance"}</Label><AmountInput id="ob-bal" value={accountBalance} onValueChange={setAccountBalance} placeholder="0" disabled={!!accountId} /></div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-[-0.025em]">How does money come in?</h1>
                <p className="text-muted-foreground">Faldo only counts money you&apos;ve already received. A schedule tells it how long that money has to last.</p>
              </div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Income type">
                {(Object.keys(INCOME_TYPES) as IncomeType[]).map((key) => (
                  <button key={key} type="button" role="radio" aria-checked={incomeType === key}
                    onClick={() => { setIncomeType(key); if (key === "allowance") setFrequency("weekly") }}
                    className={cn("pressable rounded-2xl px-4 py-3 text-left shadow-[inset_0_0_0_1px_var(--border)]", incomeType === key ? "bg-secondary/70 text-secondary-foreground shadow-[inset_0_0_0_1.5px_var(--primary)]" : "bg-card hover:bg-accent/60")}>
                    <span className="block text-sm font-medium">{INCOME_TYPES[key].label}</span>
                    <span className="block text-xs text-muted-foreground">{INCOME_TYPES[key].hint}</span>
                  </button>
                ))}
              </div>
              {INCOME_TYPES[incomeType].scheduled ? (
                <>
                  <div className="space-y-1.5"><Label htmlFor="ob-income">How much each time?</Label><AmountInput id="ob-income" size="lg" value={income} onValueChange={setIncome} placeholder="0" /></div>
                  <div className="space-y-2"><Label>How often?</Label>
                    <div className="flex flex-wrap gap-2">
                      {(["weekly", "biweekly", "semi_monthly", "monthly"] as Frequency[]).map((f) => (
                        <button key={f} type="button" onClick={() => setFrequency(f)} className={cn("pressable rounded-full px-4 py-2 text-sm font-medium", frequency === f ? "bg-foreground text-background" : "bg-card shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent/60")}>{FREQUENCY_LABELS[f]}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:w-1/2"><Label htmlFor="ob-payday">Next one arrives</Label><Input id="ob-payday" type="date" min={todayISO()} value={nextPayday} onChange={(e) => setNextPayday(e.target.value)} /></div>
                </>
              ) : (
                <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                  No schedule needed. Log income when it arrives. Until then, Safe to Spend plans the money you have over the next 30 days.
                </p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div className="space-y-2"><h1 className="text-2xl font-semibold tracking-[-0.025em]">Set a savings goal</h1><p className="text-muted-foreground">Faldo will calculate how much to save each month and when you'll get there.</p></div>
              <div className="flex flex-wrap gap-2">
                {["Emergency fund", "New laptop", "Travel", "Tuition", "New phone"].map((g) => (
                  <button key={g} type="button" onClick={() => setGoalName(g)} className={cn("pressable rounded-full px-4 py-2 text-sm font-medium", goalName === g ? "bg-foreground text-background" : "bg-card shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent/60")}>{g}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="ob-goal">Goal name</Label><Input id="ob-goal" value={goalName} onChange={(e) => setGoalName(e.target.value)} maxLength={80} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ob-target">Target amount</Label><AmountInput id="ob-target" value={goalTarget} onValueChange={setGoalTarget} placeholder="0" /></div>
                <div className="space-y-1.5"><Label htmlFor="ob-date">Target date</Label><Input id="ob-date" type="date" min={todayISO()} value={goalDate} onChange={(e) => setGoalDate(e.target.value)} /></div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div className="space-y-2"><h1 className="text-2xl font-semibold tracking-[-0.025em]">Create your first budget</h1><p className="text-muted-foreground">Set limits for a few categories. Faldo warns you before you overspend.</p></div>
              <div className="space-y-2">
                {BUDGET_PRESETS.map((name) => (
                  <div key={name} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-2 shadow-[inset_0_0_0_1px_var(--border)]">
                    <span className="flex-1 text-sm font-medium">{name}</span>
                    <AmountInput aria-label={`${name} monthly limit`} value={budgets[name] ?? ""} onValueChange={(v) => setBudgets({ ...budgets, [name]: v })} placeholder="No limit" className="w-36" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              <div className="space-y-2"><h1 className="text-2xl font-semibold tracking-[-0.025em]">Add your first transaction</h1><p className="text-muted-foreground">Just describe it. Faldo figures out the amount, merchant, category and date.</p></div>
              {txSaved ? (
                <div className="animate-rise flex items-center gap-3 rounded-2xl bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)]">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" /></span>
                  <div><p className="font-medium">Saved</p><p className="text-sm text-muted-foreground">{txSaved}</p></div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Input value={txText} onChange={(e) => setTxText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTransaction()} placeholder={`e.g. Spent ${symbol}350 at Jollibee`} className="h-14 rounded-2xl pr-28 text-base" aria-label="Describe a transaction" />
                    <Button className="absolute top-2 right-2 h-10" onClick={addTransaction} disabled={busy || !txText.trim()}>{busy ? <Loader2 className="animate-spin" /> : "Add"}</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["Spent ₱350 at Jollibee", "Grab ₱180 today", "Groceries ₱1,250 at SM"].map((ex) => (
                      <button key={ex} type="button" onClick={() => setTxText(ex)} className="rounded-full bg-muted px-3.5 py-1.5 text-[0.8125rem] text-foreground/75 hover:bg-accent hover:text-foreground">{ex}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6 text-center">
              <Panda pose="bamboo" sizes="144px" className="mx-auto w-32" />
              <div className="space-y-2">
                <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.035em]">Ask Faldo anything</h1>
                <p className="mx-auto max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">Ask about your money in plain words. Faldo looks up your records, works out exact figures and shows where they came from. It never invents numbers.</p>
              </div>
              <ul className="ios-group mx-auto max-w-md divide-y divide-border/60 text-left">
                {["Where did my money go this month?", "Can I afford a ₱3,000 purchase?", "When will I reach my goal?"].map((q) => (
                  <li key={q} className="px-4 py-3 text-[0.9375rem]">“{q}”</li>
                ))}
              </ul>
              <div className="flex flex-col justify-center gap-2 sm:flex-row">
                <Button size="lg" onClick={() => finish("/")} disabled={busy}>Go to Home <ArrowRight /></Button>
                <Button size="lg" variant="secondary" onClick={() => finish("/assistant")} disabled={busy}>Ask Faldo a question</Button>
              </div>
            </div>
          )}

          {step > 0 && step < 7 && (
            <div className="flex items-center justify-between border-t border-border/70 pt-6">
              <Button variant="ghost" onClick={back}><ArrowLeft /> Back</Button>
              <div className="flex gap-2">
                {step >= 3 && <Button variant="ghost" onClick={next}>Skip</Button>}
                <Button disabled={busy} onClick={() => {
                  if (step === 1) saveCurrency()
                  else if (step === 2) saveAccount()
                  else if (step === 3) saveIncome()
                  else if (step === 4) saveGoal()
                  else if (step === 5) saveBudget()
                  else next()
                }}>{busy ? <Loader2 className="animate-spin" /> : null} Continue <ArrowRight /></Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
