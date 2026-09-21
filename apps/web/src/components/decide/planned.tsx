"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Hourglass, Loader2, MoreHorizontal, Plus, ShoppingBag } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { Money } from "@/components/finance/money"
import { IosSheet } from "@/components/ios/sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, toMinor, todayISO } from "@/lib/format"
import { invalidateFinancialData, useAccounts, usePlanned } from "@/lib/queries"
import type { PlannedPurchase } from "@/lib/types"
import { cn } from "@/lib/utils"

export async function savePlanned(body: { name: string; amount_minor: number; category_id?: string | null; url?: string | null; pause_hours?: number }) {
  return api.post<PlannedPurchase>("/planned-purchases", body)
}

function status(p: PlannedPurchase) {
  if (p.verdict === "fits") return { text: "Fits now", tone: "text-income" }
  if (p.verdict === "stretch") return { text: "Fits, but more than this week's share", tone: "text-warning" }
  if (p.affordable_on) return { text: `Maybe around ${formatDate(p.affordable_on, "MMM d")}`, tone: "text-muted-foreground", estimate: true }
  return { text: `${formatMoney(p.over_by_minor ?? 0)} more than your Safe to Spend`, tone: "text-muted-foreground" }
}

function pauseLabel(until: string) {
  return `Thinking it over until ${new Date(until).toLocaleString("en-PH", { weekday: "short", hour: "numeric", minute: "2-digit" })}`
}

export function AddPlannedSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [url, setUrl] = useState("")
  const [pause, setPause] = useState(false)
  const [busy, setBusy] = useState(false)
  const minor = toMinor(amount)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!minor) return
    setBusy(true)
    try {
      await savePlanned({ name: name.trim(), amount_minor: minor, url: url.trim() || null, pause_hours: pause ? 24 : 0 })
      await qc.invalidateQueries({ queryKey: ["planned"] })
      toast.success("Saved to planned purchases")
      setName(""); setAmount(""); setUrl(""); setPause(false)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <IosSheet open={open} onOpenChange={onOpenChange} title="Plan a purchase" description="Faldo keeps checking it against your Safe to Spend." size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="pp-name">What is it?</Label>
          <Input id="pp-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Running shoes" /></div>
        <div className="space-y-1.5"><Label htmlFor="pp-amount">Price</Label>
          <AmountInput id="pp-amount" required value={amount} onValueChange={setAmount} placeholder="0" /></div>
        <div className="space-y-1.5"><Label htmlFor="pp-url">Link <span className="font-normal text-muted-foreground">Optional</span></Label>
          <Input id="pp-url" type="url" inputMode="url" maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
        <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
          <Checkbox checked={pause} onCheckedChange={(v) => setPause(v === true)} className="mt-0.5" />
          <span><span className="font-medium">Give it 24 hours</span><span className="block text-[0.8125rem] text-muted-foreground">A short pause before bigger buys. You can still buy any time.</span></span>
        </label>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !minor || !name.trim()}>{busy && <Loader2 className="animate-spin" />} Save</Button>
      </form>
    </IosSheet>
  )
}

function BuySheet({ item, onOpenChange }: { item: PlannedPurchase; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const usable = accounts.filter((a) => !a.archived)
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "")
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post(`/planned-purchases/${item.id}/buy`, { account_id: accountId, occurred_on: date })
      await invalidateFinancialData(qc)
      toast.success(`${item.name} logged as spending`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't log it.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <IosSheet open onOpenChange={onOpenChange} title={`Bought ${item.name}?`} description={`${formatMoney(item.amount_minor)} is logged as an expense.`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {item.is_paused && item.pause_until && <p className="rounded-xl bg-muted/60 px-4 py-3 text-[0.8125rem]">{pauseLabel(item.pause_until)}. Buying now is fine too.</p>}
        <div className="space-y-1.5"><Label htmlFor="buy-account">Paid from</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="buy-account" className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger>
            <SelectContent>{usable.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="buy-date">Date</Label><Input id="buy-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !accountId}>{busy && <Loader2 className="animate-spin" />} Log purchase</Button>
      </form>
    </IosSheet>
  )
}

export function PlannedPurchases({ className }: { className?: string }) {
  const qc = useQueryClient()
  const { data = [], isLoading } = usePlanned()
  const [adding, setAdding] = useState(false)
  const [buying, setBuying] = useState<PlannedPurchase | null>(null)
  const planned = data.filter((p) => p.status === "planned")

  async function change(item: PlannedPurchase, body: object | null) {
    try {
      if (body) await api.patch(`/planned-purchases/${item.id}`, body)
      else await api.delete(`/planned-purchases/${item.id}`)
      await qc.invalidateQueries({ queryKey: ["planned"] })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update.")
    }
  }

  return (
    <section className={cn("card-surface", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2 sm:px-5">
        <div className="min-w-0">
          <h2 className="section-title">Planned purchases</h2>
          <p className="truncate text-[0.8125rem] text-muted-foreground">Things you want, checked against your money every day</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus /> Add</Button>
      </div>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {isLoading ? <Skeleton className="h-20" /> : planned.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-5 text-[0.8125rem] text-muted-foreground">
            <ShoppingBag className="size-4 shrink-0" /> Save something you&apos;re thinking of buying. Faldo tells you when it fits.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {planned.map((p) => {
              const s = status(p)
              return (
                <li key={p.id} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[0.9375rem] font-medium">{p.name}</p>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Open ${p.name} link`} className="text-muted-foreground hover:text-foreground">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                    <p className={cn("text-[0.8125rem]", s.tone)}>{s.text}{"estimate" in s && s.estimate && <span className="text-muted-foreground"> · estimate</span>}</p>
                    {p.is_paused && p.pause_until && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Hourglass className="size-3" /> {pauseLabel(p.pause_until)}</p>}
                  </div>
                  <Money minor={p.amount_minor} className="text-[0.9375rem] font-medium" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-8" aria-label={`Options for ${p.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setBuying(p)}>I bought it</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => change(p, { status: "dropped" })}>Don&apos;t need it anymore</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => change(p, null)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <AddPlannedSheet open={adding} onOpenChange={setAdding} />
      {buying && <BuySheet item={buying} onOpenChange={(open) => { if (!open) setBuying(null) }} />}
    </section>
  )
}
