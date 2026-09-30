"use client"

import Link from "next/link"
import { useState } from "react"
import { Loader2, MailCheck } from "lucide-react"
import { useAuthDraft, AuthError, AuthField, AuthHeading, PRIMARY_PILL } from "@/features/auth"
import { api, ApiError } from "@/shared/api/client"

export default function ForgotPasswordPage() {
  // Starts with whatever was typed on Log in, and hands any change back to it.
  const [{ email }, setDraft] = useAuthDraft()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post("/auth/password/forgot", { email })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {sent ? (
        <div className="space-y-3 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-primary"><MailCheck className="size-5" strokeWidth={2} /></span>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.025em]">Check your email</h1>
          <p className="text-[0.9375rem] text-muted-foreground">If an account exists for <span className="font-medium text-foreground">{email}</span>, we sent a link to reset your password. It expires in 30 minutes.</p>
        </div>
      ) : (
        <>
          <AuthHeading title="Forgot your password?">Enter your email and we&apos;ll send you a link to reset it.</AuthHeading>
          <form onSubmit={submit} className="space-y-4">
            <AuthField label="Email" type="email" inputMode="email" placeholder="you@example.com" autoComplete="email" required
              value={email} onChange={(e) => setDraft({ email: e.target.value })} />
            {error && <AuthError>{error}</AuthError>}
            <button type="submit" disabled={busy} className={PRIMARY_PILL}>{busy && <Loader2 className="size-4 animate-spin" />} Send reset link</button>
          </form>
        </>
      )}
      <p className="text-center text-sm text-muted-foreground">
        Remembered it? <Link href="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">Log in</Link>
      </p>
    </div>
  )
}
