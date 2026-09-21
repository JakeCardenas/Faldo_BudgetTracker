"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { markWelcome } from "@/components/brand/welcome-splash"
import { api, ApiError } from "@/lib/api"
import type { Me } from "@/lib/types"

/** Only same-origin paths. Browsers treat "/\evil.com" like "//evil.com", so resolve before trusting it. */
function safeNext(next: string | null) {
  if (!next) return "/"
  try {
    const url = new URL(next, window.location.origin)
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/"
  } catch {
    return "/"
  }
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const showDemo = mode === "login" && process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN === "true"

  async function submit(e: React.FormEvent, override?: { email: string; password: string }) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const me = mode === "login"
        ? await api.post<Me>("/auth/login", override ?? { email, password })
        : await api.post<Me>("/auth/register", { email, password, display_name: name })
      qc.setQueryData(["me"], me)
      if (me.settings.onboarding_completed_at) markWelcome()
      router.replace(!me.settings.onboarding_completed_at ? "/onboarding" : safeNext(params.get("next")))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="text-[0.9375rem] text-muted-foreground">
          {mode === "login" ? "Sign in to see what's safe to spend." : "Private by design. Your data is only used to answer your questions."}
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <div className="space-y-1.5">
            <Label htmlFor="name">First name</Label>
            <Input id="name" className="h-12" autoComplete="given-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" className="h-12" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "login" && <Link href="/forgot-password" className="text-[0.8125rem] font-medium text-primary hover:underline">Forgot password?</Link>}
          </div>
          <Input id="password" className="h-12" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required
            minLength={mode === "register" ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === "register" && <p className="text-xs text-muted-foreground">At least 10 characters.</p>}
        </div>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {mode === "login" ? "Sign in" : "Create account"}
        </Button>
        {showDemo && (
          <Button type="button" variant="secondary" size="lg" className="w-full" disabled={busy}
            onClick={(e) => submit(e as unknown as React.FormEvent, { email: "jake@faldo.app", password: "faldo-demo-2026" })}>
            Explore the demo account
          </Button>
        )}
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? "New to Faldo? " : "Already have an account? "}
        <Link href={mode === "login" ? "/register" : "/login"} className="font-medium text-primary hover:underline">
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  )
}
