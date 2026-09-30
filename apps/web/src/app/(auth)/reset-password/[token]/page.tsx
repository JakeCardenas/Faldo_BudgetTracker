"use client"

import Link from "next/link"
import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { AuthError, AuthHeading, PasswordField, PRIMARY_PILL } from "@/components/auth/fields"
import { api, ApiError } from "@/lib/api"
import { signedIn } from "@/lib/session"
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
      signedIn(qc, me)
      router.replace(me.settings.onboarding_completed_at ? "/" : "/onboarding")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <AuthHeading title="Set a new password">You&apos;ll be signed out on your other devices.</AuthHeading>
      <form onSubmit={submit} className="space-y-4">
        <PasswordField label="New password" hint="At least 10 characters." autoComplete="new-password" minLength={10} required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordField label="Confirm new password" autoComplete="new-password" minLength={10} required
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && (
          <AuthError>
            {error} {error.includes("expired") && <Link href="/forgot-password" className="font-medium underline">Request a new link</Link>}
          </AuthError>
        )}
        <button type="submit" disabled={busy} className={PRIMARY_PILL}>{busy && <Loader2 className="size-4 animate-spin" />} Update password</button>
      </form>
    </div>
  )
}
