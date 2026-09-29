"use client"

import Link from "next/link"
import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, LockKeyhole } from "lucide-react"
import { PasswordField, PRIMARY_PILL } from "@/components/auth/fields"
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
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.025em]">New password</h1>
        <p className="text-[0.9375rem] text-muted-foreground">You&apos;ll be signed out on your other devices.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <PasswordField icon={LockKeyhole} label="New password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordField icon={LockKeyhole} label="Confirm password" autoComplete="new-password" minLength={10} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="px-4 text-xs text-muted-foreground">At least 10 characters.</p>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">
            {error} {error.includes("expired") && <Link href="/forgot-password" className="font-medium underline">Request a new link</Link>}
          </p>
        )}
        <button type="submit" disabled={busy} className={PRIMARY_PILL}>{busy && <Loader2 className="size-4 animate-spin" />} Update password</button>
      </form>
    </div>
  )
}
