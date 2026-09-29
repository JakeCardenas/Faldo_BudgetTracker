"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, LockKeyhole, Mail, UserRound } from "lucide-react"
import { AuthField, PasswordField, PRIMARY_PILL } from "@/components/auth/fields"
import { SIGN_IN_ERRORS, SocialSignIn } from "@/components/auth/social"
import { markWelcome } from "@/components/brand/welcome-splash"
import { api, ApiError } from "@/lib/api"
import type { Me } from "@/lib/types"
import { cn } from "@/lib/utils"

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
  // A Google or Apple sign-in that came back unfinished says why (/login?error=code).
  const [error, setError] = useState<string | null>(() => SIGN_IN_ERRORS[params.get("error") ?? ""] ?? null)
  const [busy, setBusy] = useState(false)
  const showDemo = mode === "login" && process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN === "true"
  const login = mode === "login"

  async function submit(e: React.FormEvent, override?: { email: string; password: string }) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const me = login
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
    <div className="space-y-6">
      <h1 className="text-center text-[1.75rem] leading-tight font-bold tracking-[-0.025em]">{login ? "Log in" : "Create account"}</h1>
      <form onSubmit={submit} className="space-y-3">
        {!login && <AuthField icon={UserRound} label="First name" autoComplete="given-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}
        <AuthField icon={Mail} label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField icon={LockKeyhole} label="Password" autoComplete={login ? "current-password" : "new-password"} required
          minLength={login ? 1 : 10} value={password} onChange={(e) => setPassword(e.target.value)} />
        {login ? (
          <p className="pt-1 text-center">
            <Link href="/forgot-password" className="text-[0.8125rem] font-medium text-foreground/80 underline underline-offset-4 hover:text-foreground">Forgot password?</Link>
          </p>
        ) : <p className="px-4 text-xs text-muted-foreground">At least 10 characters.</p>}
        {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className={cn(PRIMARY_PILL, "mt-2")}>
          {busy && <Loader2 className="size-4 animate-spin" />} {login ? "Log in" : "Create account"}
        </button>
        {showDemo && (
          <button type="button" disabled={busy} onClick={(e) => submit(e as unknown as React.FormEvent, { email: "jake@faldo.app", password: "faldo-demo-2026" })}
            className="pressable flex h-12 w-full items-center justify-center rounded-full bg-secondary text-[0.9375rem] font-semibold text-secondary-foreground">
            Explore the demo account
          </button>
        )}
      </form>
      <SocialSignIn next={safeNext(params.get("next"))} />
      <p className="text-center text-sm text-muted-foreground">
        {login ? "Need an account? " : "Already have an account? "}
        <Link href={login ? "/register" : "/login"} className="font-semibold text-foreground hover:underline">{login ? "Sign up" : "Log in"}</Link>
      </p>
    </div>
  )
}

