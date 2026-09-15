"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
    <div className="space-y-7">
      <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to sign in</Link>
      {sent ? (
        <div className="space-y-4">
          <span className="flex size-12 items-center justify-center rounded-lg bg-secondary text-primary"><MailCheck className="size-5" strokeWidth={1.75} /></span>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Check your email</h1>
          <p className="text-sm text-muted-foreground">If an account exists for <span className="font-medium text-foreground">{email}</span>, we sent a link to reset your password. It expires in 30 minutes.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-[-0.025em]">Reset your password</h1>
            <p className="text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
            </div>
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-10 w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Send reset link</Button>
          </form>
        </>
      )}
    </div>
  )
}
