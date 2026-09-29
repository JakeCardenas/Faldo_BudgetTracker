"use client"

import Link from "next/link"
import { useState } from "react"
import { Loader2, Mail, MailCheck } from "lucide-react"
import { AuthField, PRIMARY_PILL } from "@/components/auth/fields"
import { api, ApiError } from "@/lib/api"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
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
          <div className="space-y-2 text-center">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.025em]">Reset password</h1>
            <p className="text-[0.9375rem] text-muted-foreground">Enter your email and we&apos;ll send you a reset link.</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <AuthField icon={Mail} label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className={PRIMARY_PILL}>{busy && <Loader2 className="size-4 animate-spin" />} Send reset link</button>
          </form>
        </>
      )}
      <p className="text-center text-sm text-muted-foreground">
        Remembered it? <Link href="/login" className="font-semibold text-foreground hover:underline">Log in</Link>
      </p>
    </div>
  )
}
