"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useId, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useAuthDraft } from "../model/draft"
import { AGREE_FIRST, PolicyAgreement } from "./agreement"
import { TryDemo } from "./demo"
import { AuthError, AuthField, AuthHeading, PasswordField, PRIMARY_PILL } from "./fields"
import { SIGN_IN_ERRORS, SocialSignIn } from "./social"
import { usePolicyVersion } from "../api/options"
import { markWelcome } from "@/shared/ui/brand/welcome-splash"
import { Checkbox } from "@/shared/ui/checkbox"
import { api, ApiError } from "@/shared/api/client"
import { signedIn } from "@/entities/session"
import type { Me } from "@/shared/api/types"

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
  const [agreed, setAgreed] = useState(false)
  // A Google or Apple sign-in that came back unfinished says why (/login?error=code).
  const [error, setError] = useState<string | null>(() => SIGN_IN_ERRORS[params.get("error") ?? ""] ?? null)
  const [busy, setBusy] = useState(false)
  const login = mode === "login"
  // Once the operator approves a version of the Privacy notice and Terms, signing up agrees to that exact version.
  const { data: policy } = usePolicyVersion()
  const askAgreement = !login && Boolean(policy)
  const next = safeNext(params.get("next"))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (askAgreement && !agreed) return setError(AGREE_FIRST)
    setBusy(true)
    setError(null)
    try {
      const me = login
        ? await api.post<Me>("/auth/login", { email, password, remember })
        : await api.post<Me>("/auth/register", { email, password, display_name: name, ...(askAgreement && { accepted_policy_version: policy }) })
      signedIn(qc, me)
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
          <div className="flex min-h-11 items-start gap-2.5 px-1 py-1">
            <Checkbox id={rememberId} checked={remember} onCheckedChange={(checked) => setRemember(checked === true)}
              aria-describedby={`${rememberId}-hint`} className="mt-0.5 size-[1.125rem] rounded-[5px]" />
            <div className="space-y-0.5">
              <label htmlFor={rememberId} className="block text-sm">Remember me</label>
              {/* Matches the API: 30 days from the last visit when remembered (SESSION_TTL_DAYS), else until the browser closes. */}
              <p id={`${rememberId}-hint`} className="text-xs text-muted-foreground">
                {remember ? "Stay signed in on this device for 30 days after your last visit." : "You'll be signed out when you close the browser."}
              </p>
            </div>
          </div>
        )}

        {askAgreement && <PolicyAgreement checked={agreed} onCheckedChange={(value) => { setAgreed(value); setError(null) }} />}

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
        {/* A sandbox of the visitor's own, made by the server; it never signs in to a shared account. */}
        <TryDemo className="mx-auto inline-flex min-h-11 items-center gap-1.5 px-2 font-semibold text-foreground underline-offset-4 hover:underline disabled:opacity-60">
          Just looking? Try the demo
        </TryDemo>
      </div>
    </div>
  )
}
