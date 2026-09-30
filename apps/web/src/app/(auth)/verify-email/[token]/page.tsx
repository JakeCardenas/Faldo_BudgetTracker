"use client"

import Link from "next/link"
import { use, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { AuthError, AuthHeading, PRIMARY_PILL } from "@/features/auth"
import { api, ApiError } from "@/shared/api/client"
import type { Me } from "@/shared/api/types"

/**
 * The link from the "Confirm your email" message. It only counts while signed in to the account it was sent to (signed
 * out, the app asks to sign in first and comes back here), so someone who registered another person's address can't
 * get it confirmed by that person opening the email.
 */
export default function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const qc = useQueryClient()
  const sent = useRef(false)
  const [state, setState] = useState<"working" | "done" | "failed">("working")
  const [error, setError] = useState("")

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    api.post<Me>("/auth/email/verify", { token })
      .then((me) => { qc.setQueryData(["me"], me); setState("done") })
      .catch((err) => { setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again."); setState("failed") })
  }, [qc, token])

  if (state === "working") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Confirming your email…</p>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      {state === "done"
        ? <AuthHeading title="Email confirmed">Thanks. Your email is now confirmed for this Faldo account.</AuthHeading>
        : <><AuthHeading title="Couldn't confirm">This link didn&apos;t work for the account you&apos;re signed in to.</AuthHeading><AuthError>{error}</AuthError></>}
      <Link href={state === "done" ? "/" : "/settings/security"} className={PRIMARY_PILL}>{state === "done" ? "Continue" : "Go to Settings"}</Link>
    </div>
  )
}
