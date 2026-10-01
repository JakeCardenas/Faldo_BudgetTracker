"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useSignInOptions } from "../api/options"
import { api, ApiError } from "@/shared/api/client"
import { signedIn } from "@/entities/session"
import { markWelcome } from "@/shared/ui/brand/welcome-splash"
import type { Me } from "@/shared/api/types"
import { cn } from "@/shared/lib/utils"

/**
 * "Try the demo": the server makes this visitor a sandbox account of their own with sample data, signed in until the
 * browser closes and deleted within a day. No shared account and no password. Renders nothing when the server has the
 * demo off, or until it has said whether it's on.
 */
export function TryDemo({ className, children, hint, errorClassName }: {
  className?: string
  children: React.ReactNode
  /** A line under the button, shown only with it. */
  hint?: React.ReactNode
  errorClassName?: string
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: options } = useSignInOptions()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!options?.demo) return null

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const me = await api.post<Me>("/auth/demo")
      signedIn(qc, me)
      markWelcome()
      router.replace("/")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the demo. Please try again.")
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={start} disabled={busy} aria-busy={busy} className={className}>
        {busy && <Loader2 className="size-4 animate-spin" />} {children}
      </button>
      {hint}
      {error && <p role="alert" className={cn("text-sm text-destructive", errorClassName)}>{error}</p>}
    </>
  )
}
