"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Image from "next/image"
import Link from "next/link"
import { ChevronRight, Download, EyeOff, Flame, Monitor, Moon, Pencil, Plus, Smartphone, Sun, Trash2, Volume2 } from "lucide-react"
import { environmentStyle } from "@/components/brand/environment"
import { Panda } from "@/components/brand/panda"
import { Segmented } from "@/components/ios/segmented"
import { BACKGROUND_INFO, OUTFIT_INFO, poseFor } from "@/lib/catalog"
import { setBubbleShown, useBubbleShown } from "@/lib/bubble"
import { setAmountsHidden, useAmountsHidden } from "@/lib/privacy"
import { useSmoothTheme } from "@/lib/theme"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { CategoryIcon } from "@/components/finance/category-icon"
import { PageHeader, SectionCard } from "@/components/layout/page-header"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError } from "@/lib/api"
import { FREQUENCY_LABELS, minorToInput, timeAgo, toMinor } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useCategories, useMe, useUpdateSettings } from "@/lib/queries"
import { setSoundsEnabled, soundsEnabled } from "@/lib/sound"
import type { Category, Me } from "@/lib/types"

const NONE = "__none__"
const TIMEZONES = ["Asia/Manila", "Asia/Singapore", "Asia/Tokyo", "Asia/Dubai", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney"]

function Appearance({ me }: { me: Me }) {
  const update = useUpdateSettings()
  const { setTheme } = useSmoothTheme()
  const [sounds, setSounds] = useState(soundsEnabled)
  const hideAmounts = useAmountsHidden()
  const bubble = useBubbleShown()
  const outfit = OUTFIT_INFO[me.settings.mascot_outfit]?.name ?? "Bamboo buddy"
  const background = BACKGROUND_INFO[me.settings.home_background]?.name ?? "Bamboo grove"
  return (
    <SectionCard title="Appearance and companion" description="Make Faldo feel like yours.">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">Theme</p>
          <Segmented label="Theme" className="w-full sm:w-auto" value={me.settings.theme} onChange={(theme) => {
            setTheme(theme)
            update.mutate({ theme }, { onError: (e) => toast.error(e.message) })
          }} options={[
            { value: "system", label: <span className="inline-flex items-center gap-1.5"><Smartphone className="size-3.5" /> System</span> },
            { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun className="size-3.5" /> Light</span> },
            { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon className="size-3.5" /> Dark</span> },
          ]} />
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-[inset_0_0_0_1px_var(--border)]">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/75"><EyeOff className="size-4" strokeWidth={1.75} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem]">Hide amounts</span>
            <span className="block text-xs text-muted-foreground">Show balances and totals as ₱•••• on this device. Tap the eye on Home to switch.</span>
          </span>
          <Switch checked={hideAmounts} onCheckedChange={setAmountsHidden} aria-label="Hide amounts" />
        </label>
        <label className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-[inset_0_0_0_1px_var(--border)]">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/75"><Volume2 className="size-4" strokeWidth={1.75} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem]">Sounds</span>
            <span className="block text-xs text-muted-foreground">Soft taps and chimes for navigation, logging and rewards. Saved on this device.</span>
          </span>
          <Switch checked={sounds} onCheckedChange={(next) => { setSoundsEnabled(next); setSounds(next) }} aria-label="Sounds" />
        </label>
        <label className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-[inset_0_0_0_1px_var(--border)] lg:hidden">
          <span className="size-8 shrink-0 overflow-hidden rounded-full bg-[linear-gradient(160deg,#6cbf86_0%,#3c8d5c_55%,#2c6a45_100%)]">
            <Image src="/brand/panda/chat-head.png" alt="" width={210} height={210} sizes="32px" quality={90} className="size-full" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem]">Faldo bubble</span>
            <span className="block text-xs text-muted-foreground">A floating Faldo you can drag anywhere. Tap it to ask a question. Saved on this device.</span>
          </span>
          <Switch checked={bubble} onCheckedChange={setBubbleShown} aria-label="Faldo bubble" />
        </label>
        <div className="ios-group divide-y divide-border/60">
          <Link href="/streaks" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
            <span className="flex size-9 shrink-0 items-center justify-center"><Panda pose={poseFor(me.settings.mascot_outfit)} sizes="40px" className="w-9" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[0.9375rem]">Faldo&apos;s pose</span><span className="block text-xs text-muted-foreground">{outfit}</span></span>
            <ChevronRight className="size-4 text-muted-foreground/50" />
          </Link>
          <Link href="/streaks" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
            <span className="size-8 shrink-0 overflow-hidden rounded-full" style={environmentStyle(me.settings.home_background)} />
            <span className="min-w-0 flex-1"><span className="block text-[0.9375rem]">Home environment</span><span className="block text-xs text-muted-foreground">{background}</span></span>
            <ChevronRight className="size-4 text-muted-foreground/50" />
          </Link>
          <Link href="/streaks" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/75"><Flame className="size-4" strokeWidth={1.75} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[0.9375rem]">Streaks & badges</span><span className="block text-xs text-muted-foreground">Rewards unlock as you keep logging</span></span>
            <ChevronRight className="size-4 text-muted-foreground/50" />
          </Link>
        </div>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Smartphone className="mt-0.5 size-4 shrink-0" />
          <span>Use Faldo like an app: on iPhone, open it in Safari, tap Share, then <b>Add to Home Screen</b>. On Android, tap the menu and choose <b>Install app</b>.</span>
        </p>
      </div>
    </SectionCard>
  )
}

function Preferences({ me }: { me: Me }) {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const s = me.settings
  const [name, setName] = useState(me.display_name)
  const [timezone, setTimezone] = useState(s.timezone)
  const [frequency, setFrequency] = useState<string>(s.pay_frequency ?? NONE)
  const [income, setIncome] = useState(minorToInput(s.monthly_income_minor))
  const [buffer, setBuffer] = useState(minorToInput(s.safe_to_spend_buffer_minor))
  const [defaultAccount, setDefaultAccount] = useState(s.default_account_id ?? NONE)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const updated = await api.patch<Me>("/me/settings", {
        display_name: name, timezone, pay_frequency: frequency === NONE ? null : frequency,
        monthly_income_minor: income ? toMinor(income) : null, safe_to_spend_buffer_minor: toMinor(buffer || "0") ?? 0,
        default_account_id: defaultAccount === NONE ? null : defaultAccount,
      })
      qc.setQueryData(["me"], updated)
      await invalidateFinancialData(qc)
      toast.success("Settings saved")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save settings.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard title="Profile and preferences" description="These shape your forecast, safe-to-spend and AI answers.">
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="s-name">First name</Label><Input id="s-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input value={me.email} disabled /></div>
        <div className="space-y-1.5"><Label>Currency</Label><Input value={`${s.currency} (₱)`} disabled /><p className="text-xs text-muted-foreground">Set during onboarding. Faldo tracks one currency per profile.</p></div>
        <div className="space-y-1.5"><Label>Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>Pay frequency</Label>
          <Select value={frequency} onValueChange={setFrequency}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Not set</SelectItem>{Object.entries(FREQUENCY_LABELS).filter(([k]) => k !== "once").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="s-income">Typical monthly income</Label><AmountInput id="s-income" value={income} onValueChange={setIncome} placeholder="Optional" /></div>
        <div className="space-y-1.5"><Label htmlFor="s-buffer">Safety buffer</Label><AmountInput id="s-buffer" value={buffer} onValueChange={setBuffer} /><p className="text-xs text-muted-foreground">Kept aside in safe-to-spend and risk checks.</p></div>
        <div className="space-y-1.5"><Label>Default account</Label>
          <Select value={defaultAccount} onValueChange={setDefaultAccount}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>None</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
          <p className="text-xs text-muted-foreground">Used when a described transaction doesn't mention an account.</p>
        </div>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></div>
      </form>
    </SectionCard>
  )
}

function Security() {
  const qc = useQueryClient()
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<{ id: string; created_at: string; last_seen_at: string; user_agent: string | null; current: boolean }[]>("/auth/sessions"),
  })
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [busy, setBusy] = useState(false)

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post("/me/password", { current_password: current, new_password: next })
      setCurrent("")
      setNext("")
      await qc.invalidateQueries({ queryKey: ["sessions"] })
      toast.success("Password updated. Other devices were signed out.")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update your password.")
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id?: string) {
    try {
      if (id) await api.delete(`/auth/sessions/${id}`)
      else await api.post("/auth/sessions/revoke-others")
      await qc.invalidateQueries({ queryKey: ["sessions"] })
      toast.success(id ? "Device signed out" : "Signed out of other devices")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't sign out that device.")
    }
  }

  const device = (ua: string | null) => {
    if (!ua) return "Unknown device"
    const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"
    const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : ""
    return os ? `${browser} on ${os}` : browser
  }

  return (
    <SectionCard title="Security" description="Your password and the devices signed in to your account.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={changePassword} className="space-y-3">
          <p className="text-sm font-medium">Change password</p>
          <div className="space-y-1.5"><Label htmlFor="pw-current">Current password</Label><Input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pw-new">New password</Label><Input id="pw-new" type="password" autoComplete="new-password" minLength={10} required value={next} onChange={(e) => setNext(e.target.value)} /><p className="text-xs text-muted-foreground">At least 10 characters.</p></div>
          <Button type="submit" variant="outline" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
        </form>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Active sessions</p>
            {sessions.length > 1 && <Button variant="ghost" size="sm" onClick={() => revoke()}>Sign out others</Button>}
          </div>
          <ul className="divide-y rounded-lg border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <Monitor className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{device(s.user_agent)} {s.current && <span className="ml-1 rounded-md bg-secondary px-1.5 py-0.5 text-[0.6875rem] text-secondary-foreground">This device</span>}</p>
                  <p className="text-xs text-muted-foreground">Active {timeAgo(s.last_seen_at)} · signed in {timeAgo(s.created_at)}</p>
                </div>
                {!s.current && <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>Sign out</Button>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionCard>
  )
}

function CategoryDialog({ category, subcategories, onClose }: { category: Category; subcategories: Category[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(category.name)
  const [essential, setEssential] = useState(category.is_essential)
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.patch(`/categories/${category.id}`, { name, is_essential: essential })
      await invalidateFinancialData(qc)
      await qc.invalidateQueries({ queryKey: ["categories"] })
      toast.success("Category updated")
      onClose()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update the category.")
    }
  }

  async function remove(target: Category) {
    try {
      await api.delete(`/categories/${target.id}`)
      await invalidateFinancialData(qc)
      await qc.invalidateQueries({ queryKey: ["categories"] })
      toast.success(`${target.name} deleted`)
      setConfirmDelete(null)
      if (target.id === category.id) onClose()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete the category.")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit category</DialogTitle><DialogDescription>Changes apply to past and future transactions.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="cat-name">Name</Label><Input id="cat-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
          {category.kind === "expense" && (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span><span className="block text-sm font-medium">Essential spending</span><span className="block text-xs text-muted-foreground">Used by the health score and “what should I reduce” answers</span></span>
              <Switch checked={essential} onCheckedChange={setEssential} />
            </label>
          )}
          {subcategories.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Subcategories</p>
              <ul className="divide-y rounded-lg border">
                {subcategories.map((sub) => (
                  <li key={sub.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    {sub.name}
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${sub.name}`} onClick={() => setConfirmDelete(sub)}><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(category)}><Trash2 /> Delete</Button>
            <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
          </div>
        </form>
      </DialogContent>
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Transactions keep their amounts but become uncategorized{confirmDelete && !confirmDelete.parent_id ? ", and its subcategories and budget limits are removed" : ""}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => confirmDelete && remove(confirmDelete)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

function Categories() {
  const qc = useQueryClient()
  const { data: categories = [] } = useCategories()
  const [name, setName] = useState("")
  const [parent, setParent] = useState(NONE)
  const [kind, setKind] = useState<"expense" | "income">("expense")
  const [editing, setEditing] = useState<Category | null>(null)
  const tops = categories.filter((c) => !c.parent_id)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const parentCat = categories.find((c) => c.id === parent)
    try {
      await api.post("/categories", { name, kind: parentCat?.kind ?? kind, parent_id: parent === NONE ? null : parent })
      await qc.invalidateQueries({ queryKey: ["categories"] })
      setName("")
      toast.success("Category added")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't add category.")
    }
  }

  return (
    <SectionCard title="Categories" description="Top-level categories and subcategories used across budgets, reports and AI.">
      <form onSubmit={add} className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" required maxLength={60} />
        <Select value={parent} onValueChange={setParent}><SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={NONE}>Top-level</SelectItem>{tops.map((c) => <SelectItem key={c.id} value={c.id}>Under {c.name}</SelectItem>)}</SelectContent></Select>
        {parent === NONE && <Select value={kind} onValueChange={(v) => setKind(v as "expense" | "income")}><SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select>}
        <Button type="submit" variant="outline"><Plus /> Add</Button>
      </form>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {tops.map((c) => (
          <button key={c.id} type="button" onClick={() => setEditing(c)}
            className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/60">
            <CategoryIcon icon={c.icon} color={c.color} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{c.name} <span className="text-xs font-normal text-muted-foreground">{c.kind}{c.is_essential && ", essential"}</span></p>
              <p className="truncate text-xs text-muted-foreground">{categories.filter((s) => s.parent_id === c.id).map((s) => s.name).join(", ") || "No subcategories"}</p>
            </div>
            <Pencil className="mt-0.5 size-3.5 text-muted-foreground" />
          </button>
        ))}
      </div>
      {editing && <CategoryDialog category={editing} subcategories={categories.filter((s) => s.parent_id === editing.id)} onClose={() => setEditing(null)} />}
    </SectionCard>
  )
}

function Memory() {
  const qc = useQueryClient()
  const { data: notes = [] } = useQuery({ queryKey: ["notes"], queryFn: () => api.get<{ id: string; content: string; created_at: string }[]>("/notes") })
  const { data: status } = useQuery({ queryKey: ["assistant-status"], queryFn: () => api.get<{ provider: string; is_development: boolean; supports_vision: boolean }>("/assistant/status") })
  const [content, setContent] = useState("")
  async function add(e: React.FormEvent) {
    e.preventDefault()
    await api.post("/notes", { content })
    setContent("")
    qc.invalidateQueries({ queryKey: ["notes"] })
    toast.success("Saved to financial memory")
  }
  async function remove(id: string) {
    await api.delete(`/notes/${id}`)
    qc.invalidateQueries({ queryKey: ["notes"] })
  }
  return (
    <SectionCard title="AI and financial memory"
      description="Notes give the assistant context your numbers can't, like why a month was unusual. They're searchable only by you.">
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg border px-2.5 py-1">Provider: <span className="font-medium">{status?.provider ?? "…"}</span></span>
        {status?.is_development && <span className="rounded-lg border border-warning/30 bg-warning-soft px-2.5 py-1 text-warning">Development mode: rule-based answers, local embeddings</span>}
        <span className="rounded-lg border px-2.5 py-1">Receipt reading: {status?.supports_vision ? "enabled" : "not configured"}</span>
      </div>
      <form onSubmit={add} className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} maxLength={1000} required placeholder="e.g. Lent ₱3,000 to my brother in August; he'll pay back in October." />
        <Button type="submit" variant="outline" className="sm:self-end"><Plus /> Remember</Button>
      </form>
      <ul className="divide-y">
        {notes.length === 0 && <li className="py-3 text-sm text-muted-foreground">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="flex items-start gap-3 py-2.5">
            <p className="flex-1 text-sm">{n.content}<span className="block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span></p>
            <Button variant="ghost" size="icon" aria-label="Delete note" onClick={() => remove(n.id)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function DataPrivacy() {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [typed, setTyped] = useState("")
  async function destroy() {
    await api.delete("/me")
    router.replace("/register")
  }
  return (
    <SectionCard title="Data and privacy" description="Your data stays in your account. Faldo never sells it or connects to your bank.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-medium">Export your data</p><p className="text-xs text-muted-foreground">Accounts, transactions, budgets, goals, bills, debts and notes as JSON.</p></div>
        <Button variant="outline" asChild><a href="/api/v1/me/export"><Download /> Download export</a></Button>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-medium text-destructive">Delete account</p><p className="text-xs text-muted-foreground">Permanently removes all financial data, AI memory and receipt images.</p></div>
        <Button variant="destructive" onClick={() => setConfirm(true)}><Trash2 /> Delete account</Button>
      </div>
      <AlertDialog open={confirm} onOpenChange={(open) => { setConfirm(open); if (!open) setTyped("") }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete your Faldo account?</AlertDialogTitle><AlertDialogDescription>This permanently deletes everything. Type DELETE to confirm.</AlertDialogDescription></AlertDialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type DELETE to confirm" />
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={typed !== "DELETE"} onClick={destroy}>Delete forever</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  )
}

export default function SettingsPage() {
  const { data: me } = useMe()
  if (!me) return null
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Preferences, categories, AI memory and your data" />
      <Appearance me={me} />
      <Preferences me={me} />
      <Security />
      <Memory />
      <Categories />
      <DataPrivacy />
    </div>
  )
}
