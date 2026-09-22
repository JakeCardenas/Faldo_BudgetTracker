"use client"

import Image from "next/image"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Brain, Database, Download, EyeOff, KeyRound, Monitor, Moon, Palette, Plus, SlidersHorizontal, Smartphone, Sun, Tags, Trash2, Volume2, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { CategoryIcon } from "@/components/finance/category-icon"
import { ListGroup, ListRow } from "@/components/ios/list"
import { Segmented } from "@/components/ios/segmented"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError } from "@/lib/api"
import { setBubbleShown, useBubbleShown } from "@/lib/bubble"
import { FREQUENCY_LABELS, minorToInput, timeAgo, toMinor } from "@/lib/format"
import { setAmountsHidden, useAmountsHidden } from "@/lib/privacy"
import { invalidateFinancialData, useAccounts, useCategories, useUpdateSettings } from "@/lib/queries"
import { setSoundsEnabled, soundsEnabled } from "@/lib/sound"
import { useSmoothTheme } from "@/lib/theme"
import type { Category, Me } from "@/lib/types"

const NONE = "__none__"
const TIMEZONES = ["Asia/Manila", "Asia/Singapore", "Asia/Tokyo", "Asia/Dubai", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney"]

function Appearance({ me }: { me: Me }) {
  const update = useUpdateSettings()
  const { setTheme } = useSmoothTheme()
  const [sounds, setSounds] = useState(soundsEnabled)
  const hideAmounts = useAmountsHidden()
  const bubble = useBubbleShown()
  return (
    <div className="space-y-5">
      <Segmented label="Theme" className="w-full" value={me.settings.theme} onChange={(theme) => {
        setTheme(theme)
        update.mutate({ theme }, { onError: (e) => toast.error(e.message) })
      }} options={[
        { value: "system", label: <span className="inline-flex items-center gap-1.5"><Smartphone className="size-3.5" /> System</span> },
        { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun className="size-3.5" /> Light</span> },
        { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon className="size-3.5" /> Dark</span> },
      ]} />
      <ListGroup>
        <ListRow icon={EyeOff} title="Hide amounts" toggle trailing={<Switch checked={hideAmounts} onCheckedChange={setAmountsHidden} aria-label="Hide amounts" />} />
        <ListRow icon={Volume2} title="Sounds" toggle trailing={<Switch checked={sounds} onCheckedChange={(next) => { setSoundsEnabled(next); setSounds(next) }} aria-label="Sounds" />} />
        <ListRow className="lg:hidden" title="Faldo bubble" toggle
          leading={<span className="size-6 shrink-0 overflow-hidden rounded-full bg-[linear-gradient(160deg,#6cbf86_0%,#3c8d5c_55%,#2c6a45_100%)]"><Image src="/brand/panda/chat-head.png" alt="" width={210} height={210} sizes="24px" quality={90} className="size-full" /></span>}
          trailing={<Switch checked={bubble} onCheckedChange={setBubbleShown} aria-label="Faldo bubble" />} />
      </ListGroup>
    </div>
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
      toast.success("Saved")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="s-name">First name</Label><Input id="s-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Pay frequency</Label>
        <Select value={frequency} onValueChange={setFrequency}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={NONE}>Not set</SelectItem>{Object.entries(FREQUENCY_LABELS).filter(([k]) => k !== "once").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="s-income">Monthly income</Label><AmountInput id="s-income" value={income} onValueChange={setIncome} placeholder="Optional" /></div>
      <div className="space-y-1.5"><Label htmlFor="s-buffer">Safety buffer</Label><AmountInput id="s-buffer" value={buffer} onValueChange={setBuffer} /></div>
      <div className="space-y-1.5"><Label>Default account</Label>
        <Select value={defaultAccount} onValueChange={setDefaultAccount}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={NONE}>None</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-1.5"><Label>Timezone</Label>
        <Select value={timezone} onValueChange={setTimezone}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent></Select>
      </div>
      <Button type="submit" disabled={busy} className="sm:col-span-2 sm:justify-self-end">{busy ? "Saving…" : "Save"}</Button>
    </form>
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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <form onSubmit={changePassword} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="pw-current">Current password</Label><Input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="pw-new">New password</Label><Input id="pw-new" type="password" autoComplete="new-password" minLength={10} required placeholder="At least 10 characters" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Updating…" : "Change password"}</Button>
      </form>
      <ListGroup title="Devices">
        {sessions.map((s) => (
          <ListRow key={s.id} icon={Monitor} title={<>{device(s.user_agent)}{s.current && <span className="ml-2 text-sm text-muted-foreground">This device</span>}</>}
            trailing={!s.current && <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>Sign out</Button>} />
        ))}
        {sessions.length > 1 && <ListRow title="Sign out of other devices" onClick={() => revoke()} destructive />}
      </ListGroup>
    </div>
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
              <span className="text-sm font-medium">Essential spending</span>
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
    <div className="space-y-5">
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex gap-2 sm:contents">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" required maxLength={60} aria-label="New category name" />
          <Button type="submit" size="icon" aria-label="Add category" className="shrink-0 sm:order-last"><Plus /></Button>
        </div>
        <div className="flex gap-2">
          <Select value={parent} onValueChange={setParent}><SelectTrigger className="flex-1 sm:w-48" aria-label="Where it goes"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Top-level</SelectItem>{tops.map((c) => <SelectItem key={c.id} value={c.id}>Under {c.name}</SelectItem>)}</SelectContent></Select>
          {parent === NONE && <Select value={kind} onValueChange={(v) => setKind(v as "expense" | "income")}><SelectTrigger className="w-32" aria-label="Kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select>}
        </div>
      </form>
      <ListGroup>
        {tops.map((c) => (
          <ListRow key={c.id} title={c.name} onClick={() => setEditing(c)} leading={<CategoryIcon icon={c.icon} color={c.color} size="sm" />} />
        ))}
      </ListGroup>
      {editing && <CategoryDialog category={editing} subcategories={categories.filter((s) => s.parent_id === editing.id)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Memory() {
  const qc = useQueryClient()
  const { data: notes = [] } = useQuery({ queryKey: ["notes"], queryFn: () => api.get<{ id: string; content: string; created_at: string }[]>("/notes") })
  const [content, setContent] = useState("")
  async function add(e: React.FormEvent) {
    e.preventDefault()
    await api.post("/notes", { content })
    setContent("")
    qc.invalidateQueries({ queryKey: ["notes"] })
    toast.success("Faldo will remember that")
  }
  async function remove(id: string) {
    await api.delete(`/notes/${id}`)
    qc.invalidateQueries({ queryKey: ["notes"] })
  }
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-col gap-2">
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={1000} required aria-label="Something Faldo should remember"
          placeholder="Something Faldo should know, like: lent ₱3,000 to my brother in August, he pays back in October." />
        <Button type="submit" variant="secondary" className="self-end"><Plus /> Remember</Button>
      </form>
      <ul className="divide-y divide-border/70">
        {notes.map((n) => (
          <li key={n.id} className="flex items-start gap-3 py-3">
            <p className="flex-1 text-[0.9375rem]">{n.content}<span className="block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span></p>
            <Button variant="ghost" size="icon" aria-label="Forget this" onClick={() => remove(n.id)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function YourData() {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [typed, setTyped] = useState("")
  async function destroy() {
    await api.delete("/me")
    router.replace("/register")
  }
  return (
    <>
      <ListGroup>
        <ListRow icon={Download} title="Download your data" href="/api/v1/me/export" external />
      </ListGroup>
      <ListGroup divider className="mt-3">
        <ListRow title="Delete account" onClick={() => setConfirm(true)} destructive />
      </ListGroup>
      <AlertDialog open={confirm} onOpenChange={(open) => { setConfirm(open); if (!open) setTyped("") }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete your Faldo account?</AlertDialogTitle><AlertDialogDescription>This permanently deletes all your money data, notes and receipts. Type DELETE to confirm.</AlertDialogDescription></AlertDialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type DELETE to confirm" />
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={typed !== "DELETE"} onClick={destroy}>Delete forever</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Settings, one screen each, in the order people reach for them. */
export const SETTINGS_SECTIONS: { slug: string; label: string; icon: LucideIcon; Section: React.ComponentType<{ me: Me }> }[] = [
  { slug: "appearance", label: "Appearance", icon: Palette, Section: Appearance },
  { slug: "preferences", label: "Preferences", icon: SlidersHorizontal, Section: Preferences },
  { slug: "categories", label: "Categories", icon: Tags, Section: Categories },
  { slug: "memory", label: "Faldo's memory", icon: Brain, Section: Memory },
  { slug: "security", label: "Password and devices", icon: KeyRound, Section: Security },
  { slug: "data", label: "Your data", icon: Database, Section: YourData },
]
