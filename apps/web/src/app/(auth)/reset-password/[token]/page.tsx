"use client"

import Link from "next/link"
import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError } from "@/lib/api"
import type { Me } from "@/lib/types"

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError("The passwords don't match.")
    setBusy(true)
    setError(null)
    try {
      const me = await api.post<Me>("/auth/password/reset", { token, password })
      qc.setQueryData(["me"], me)
      router.replace(me.settings.onboarding_completed_at ? "/" : "/onboarding")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">You'll be signed out on your other devices.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
          <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" minLength={10} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-10" />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
            {error} {error.includes("expired") && <Link href="/forgot-password" className="font-medium underline">Request a new link</Link>}
          </p>
        )}
        <Button type="submit" className="h-10 w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Update password</Button>
      </form>
    </div>
  )
}
