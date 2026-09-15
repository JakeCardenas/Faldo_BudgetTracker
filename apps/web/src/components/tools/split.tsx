"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, Receipt, Trash2, UserRound, Users } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { Segmented } from "@/components/ios/segmented"
import { useAppActions } from "@/components/layout/app-context"
import { Disclaimer, Field, inputClass } from "@/components/tools/shared"
import { api, ApiError } from "@/lib/api"
import { formatMoney, minorToInput, toMinor, todayISO } from "@/lib/format"
import { invalidateFinancialData } from "@/lib/queries"
import { cn } from "@/lib/utils"

interface Person { id: number; name: string; custom: string }

export function SplitBill() {
  const qc = useQueryClient()
  const { openAddTransaction } = useAppActions()
  const [what, setWhat] = useState("Dinner")
  const [total, setTotal] = useState("3,200")
  const [mode, setMode] = useState<"equal" | "custom">("equal")
  const [includeMe, setIncludeMe] = useState(true)
  const [people, setPeople] = useState<Person[]>([{ id: 1, name: "Carlo", custom: "" }, { id: 2, name: "Bea", custom: "" }])
  const [dueOn, setDueOn] = useState("")
  const [saving, setSaving] = useState(false)

  const totalMinor = toMinor(total) ?? 0
  const heads = people.length + (includeMe ? 1 : 0)
  const equalShare = heads > 0 ? Math.floor(totalMinor / heads) : 0
  const shares = people.map((p) => (mode === "equal" ? equalShare : toMinor(p.custom) ?? 0))
  const othersTotal = shares.reduce((s, v) => s + v, 0)
  const myShare = totalMinor - othersTotal
  const valid = totalMinor > 0 && people.length > 0 && people.every((p, i) => p.name.trim() && shares[i] > 0) && myShare >= 0

  async function create() {
    if (!valid) return
    setSaving(true)
    try {
      await Promise.all(people.map((p, i) => api.post("/debts", {
        direction: "owed_to_me", counterparty: p.name.trim(), amount_minor: shares[i], started_on: todayISO(),
        due_on: dueOn || null, notes: `Share of ${what || "a bill"} (${formatMoney(totalMinor)} total)`,
      })))
      await invalidateFinancialData(qc)
      toast.success(`Tracking ${formatMoney(othersTotal)} owed to you by ${people.length} ${people.length === 1 ? "friend" : "friends"}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save the split.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="card-surface space-y-4 p-5">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label="What for"><input value={what} onChange={(e) => setWhat(e.target.value)} maxLength={60} className={inputClass} /></Field>
          <Field label="Total bill"><AmountInput value={total} onValueChange={setTotal} className="h-11" /></Field>
        </div>
        <Segmented label="Split mode" className="w-full" value={mode} onChange={setMode} options={[{ value: "equal", label: "Split equally" }, { value: "custom", label: "Custom amounts" }]} />
        <label className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
          <span className="flex items-center gap-2 text-sm"><UserRound className="size-4 text-muted-foreground" /> Include my share</span>
          <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} className="size-5 accent-[var(--primary)]" />
        </label>
        <div className="space-y-2">
          <p className="text-[0.8125rem] text-muted-foreground">Friends</p>
          {people.map((person, i) => (
            <div key={person.id} className="flex items-center gap-2">
              <input value={person.name} onChange={(e) => setPeople(people.map((p) => p.id === person.id ? { ...p, name: e.target.value } : p))}
                placeholder="Name" maxLength={80} className={cn(inputClass, "flex-1")} aria-label={`Friend ${i + 1} name`} />
              {mode === "custom" ? (
                <AmountInput value={person.custom} onValueChange={(v) => setPeople(people.map((p) => p.id === person.id ? { ...p, custom: v } : p))} className="h-11 w-32" aria-label={`${person.name} share`} />
              ) : <span className="tabular w-24 text-right text-sm font-medium">{formatMoney(equalShare)}</span>}
              <button type="button" onClick={() => setPeople(people.filter((p) => p.id !== person.id))} aria-label="Remove friend" className="pressable flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setPeople([...people, { id: Date.now(), name: "", custom: mode === "custom" ? minorToInput(equalShare) : "" }])}
            className="pressable flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed text-sm font-medium text-primary"><Plus className="size-4" /> Add friend</button>
        </div>
        <Field label="Pay back by (optional)"><input type="date" value={dueOn} min={todayISO()} onChange={(e) => setDueOn(e.target.value)} className={inputClass} /></Field>
      </section>

      <section className="card-surface flex flex-col p-5">
        <div className="rounded-lg bg-muted/60 p-4">
          <p className="text-[0.8125rem] text-muted-foreground">Friendly reminder from Faldo</p>
          <p className="mt-1 text-lg font-semibold">{people[0]?.name || "Your friend"} still owes you</p>
          <p className="tabular text-3xl font-semibold">{formatMoney(shares[0] ?? 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">For {what || "the bill"}</p>
        </div>
        <ul className="mt-4 flex-1 divide-y divide-border/60">
          {includeMe && <li className="flex justify-between py-2 text-sm"><span className="font-semibold">You</span><span className={cn("tabular font-medium", myShare < 0 && "text-expense")}>{formatMoney(myShare)}</span></li>}
          {people.map((p, i) => <li key={p.id} className="flex justify-between py-2 text-sm"><span>{p.name || "Friend"}</span><span className="tabular font-medium text-income">{formatMoney(shares[i])}</span></li>)}
        </ul>
        {!includeMe && myShare > 0 && mode === "equal" && <p className="text-xs text-muted-foreground">₱{(myShare / 100).toFixed(2)} left over from rounding stays with you.</p>}
        {myShare < 0 && <p className="text-xs font-semibold text-expense">The shares add up to more than the bill.</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => openAddTransaction({ mode: "expense", preset: { amount_minor: totalMinor, note: what } })}
            className="pressable flex h-11 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium"><Receipt className="size-4" /> Log the bill</button>
          <button type="button" onClick={create} disabled={!valid || saving}
            className="pressable flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"><Users className="size-4" /> {saving ? "Saving…" : "Track who owes"}</button>
        </div>
      </section>
      <div className="lg:col-span-2"><Disclaimer>Each friend's share is saved in Debt &amp; owed, where you can record payments as they pay you back.</Disclaimer></div>
    </div>
  )
}
