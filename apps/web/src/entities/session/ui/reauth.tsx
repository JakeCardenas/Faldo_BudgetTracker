"use client"

import { useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { api, ApiError, download, REAUTH_REQUIRED, type Query } from "@/shared/api/client"

const PROVIDER_NAMES: Record<string, string> = { google: "Google", apple: "Apple" }

/**
 * Downloading everything or deleting the account needs a recent sign-in on this device (the server checks). When it
 * asks, this confirms it's you and then does what was asked: a password here, or signing in with Google or Apple again.
 */
export function useConfirmIdentity() {
  const [methods, setMethods] = useState<string[] | null>(null)
  const pending = useRef<((confirmed: boolean) => void) | null>(null)

  async function guard<T>(work: () => Promise<T>): Promise<T | undefined> {
    try {
      return await work()
    } catch (error) {
      if (!(error instanceof ApiError && error.type === REAUTH_REQUIRED)) throw error
      const confirmed = await new Promise<boolean>((resolve) => {
        pending.current = resolve
        setMethods(Array.isArray(error.body.methods) ? (error.body.methods as string[]) : ["password"])
      })
      setMethods(null)
      return confirmed ? await work() : undefined
    }
  }

  const finish = (confirmed: boolean) => {
    pending.current?.(confirmed)
    pending.current = null
  }
  const dialog = <ConfirmIdentityDialog methods={methods} onDone={finish} />
  return { guard, dialog }
}

/** Saves a file from the API, asking to confirm it's you first when the server wants that. */
export async function saveFile(path: string, query?: Query) {
  const { blob, filename } = await download(path, query)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ConfirmIdentityDialog({ methods, onDone }: { methods: string[] | null; onDone: (confirmed: boolean) => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const providers = (methods ?? []).filter((m) => m !== "password")
  const next = typeof window === "undefined" ? "/settings/data" : window.location.pathname

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post("/auth/reauthenticate", { password })
      setPassword("")
      onDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={methods !== null} onOpenChange={(open) => { if (!open) { setPassword(""); setError(null); onDone(false) } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm it&apos;s you</DialogTitle>
          <DialogDescription>To keep your money data safe, confirm your identity before downloading or deleting it.</DialogDescription>
        </DialogHeader>
        {methods?.includes("password") && (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reauth-password">Password</Label>
              <Input id="reauth-password" type="password" autoComplete="current-password" required autoFocus
                value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "reauth-error" : undefined} />
              {error && <p id="reauth-error" role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={busy || !password}>{busy && <Loader2 className="animate-spin" />} Confirm</Button>
          </form>
        )}
        {providers.map((provider) => (
          <Button key={provider} variant="secondary" className="w-full" asChild>
            <a href={`/api/v1/auth/${provider}/start?next=${encodeURIComponent(next)}`}>Continue with {PROVIDER_NAMES[provider] ?? provider}</a>
          </Button>
        ))}
        {providers.length > 0 && <p className="text-xs text-muted-foreground">After signing in again, choose the download or delete once more.</p>}
      </DialogContent>
    </Dialog>
  )
}
