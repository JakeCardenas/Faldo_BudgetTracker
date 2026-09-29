"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useId, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useAuthDraft } from "@/components/auth/draft"
import { AuthError, AuthField, AuthHeading, PasswordField, PRIMARY_PILL } from "@/components/auth/fields"
import { SIGN_IN_ERRORS, SocialSignIn } from "@/components/auth/social"
import { markWelcome } from "@/components/brand/welcome-splash"
import { Checkbox } from "@/components/ui/checkbox"
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

/** A link to another sign-in screen that keeps where the person was headed. */
function withNext(path: string, next: string) {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`
}

/**
 * Log in and Create account. Labels sit above their fields, the green button is the one thing that stands out, Google
 * comes after an "or", and switching between the two screens keeps what was typed (see AuthDraftProvider).
 */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const rememberId = useId()
  const [{ name, email, password }, setDraft] = useAuthDraft()
  const [remember, setRemember] = useState(true)
  // A Google or Apple sign-in that came back unfinished says why (/login?error=code).
  const [error, setError] = useState<string | null>(() => SIGN_IN_ERRORS[params.get("error") ?? ""] ?? null)
  const [busy, setBusy] = useState(false)
  const login = mode === "login"
  const showDemo = login && process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN === "true"
  const next = safeNext(params.get("next"))

  async function submit(e: React.FormEvent, override?: { email: string; password: string }) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const me = login
        ? await api.post<Me>("/auth/login", { ...(override ?? { email, password }), remember: override ? true : remember })
        : await api.post<Me>("/auth/register", { email, password, display_name: name })
      qc.setQueryData(["me"], me)
      if (me.settings.onboarding_completed_at) markWelcome()
      router.replace(!me.settings.onboarding_completed_at ? "/onboarding" : next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <AuthHeading title={login ? "Welcome back" : "Create your account"}>
        {login ? "Log in to pick up where you left off." : "Start tracking your money in a minute."}
      </AuthHeading>

      <form onSubmit={submit} className="space-y-4">
        {!login && (
          <AuthField label="First name" placeholder="e.g. Juan" autoComplete="given-name" autoCapitalize="words" required maxLength={80}
            value={name} onChange={(e) => setDraft({ name: e.target.value })} />
        )}
        <AuthField label="Email" type="email" inputMode="email" placeholder="you@example.com" autoComplete="email" required
          value={email} onChange={(e) => setDraft({ email: e.target.value })} />
        <PasswordField label="Password" autoComplete={login ? "current-password" : "new-password"} required minLength={login ? 1 : 10}
          hint={login ? undefined : "At least 10 characters."}
          action={login && (
            <Link href="/forgot-password" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Forgot password?</Link>
          )}
          value={password} onChange={(e) => setDraft({ password: e.target.value })} />

        {login && (
          <div className="flex min-h-11 items-center gap-2.5 px-1">
            <Checkbox id={rememberId} checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} className="size-[1.125rem] rounded-[5px]" />
            <label htmlFor={rememberId} className="text-sm">Remember me</label>
          </div>
        )}

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={busy} className={PRIMARY_PILL}>
          {busy && <Loader2 className="size-4 animate-spin" />} {login ? "Log in" : "Create account"}
        </button>
      </form>

      <SocialSignIn next={next} />

      <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p>
          {login ? "Don't have an account? " : "Already have an account? "}
          <Link href={withNext(login ? "/register" : "/login", next)} className="font-semibold text-foreground underline-offset-4 hover:underline">
            {login ? "Sign up" : "Log in"}
          </Link>
        </p>
        {showDemo && (
          <p>
            Just looking?{" "}
            <button type="button" disabled={busy} onClick={(e) => submit(e as unknown as React.FormEvent, { email: "jake@faldo.app", password: "faldo-demo-2026" })}
              className="font-semibold text-foreground underline-offset-4 hover:underline disabled:opacity-60">
              Explore the demo
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
