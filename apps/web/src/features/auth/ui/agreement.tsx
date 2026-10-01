"use client"

import Link from "next/link"
import { useId, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { AuthError, AuthHeading, PRIMARY_PILL } from "./fields"
import { Checkbox } from "@/shared/ui/checkbox"
import { Panda } from "@/shared/ui/brand/panda"
import { api, ApiError } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Me } from "@/shared/api/types"

const LINK = "font-medium text-primary underline underline-offset-2"

/**
 * Agreeing to the approved Privacy notice and Terms of use. It only appears once the operator sets an approved version
 * (POLICY_VERSION in the API); until then the documents are drafts and nobody is asked to agree to them. Whoever
 * approves the documents should confirm this wording too. The links open in a new tab so nothing typed is lost.
 */
export function PolicyAgreement({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3 px-1">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} className="mt-0.5 size-[1.125rem] rounded-[5px]" />
      <label htmlFor={id} className="text-sm leading-snug">
        I agree to the <Link href="/terms" target="_blank" className={LINK}>Terms of use</Link> and have read
        the <Link href="/privacy" target="_blank" className={LINK}>Privacy notice</Link>.
      </label>
    </div>
  )
}

export const AGREE_FIRST = "To continue, agree to the Terms of use and the Privacy notice."

/**
 * Shown instead of the app to someone who hasn't agreed to the current approved version yet: accounts made before it
 * was approved, or with Google or Apple (which create the account before Faldo can ask). Only their own tick records it.
 */
export function PolicyGate({ version, onSignOut }: { version: string; onSignOut: () => void }) {
  const qc = useQueryClient()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed) return setError(AGREE_FIRST)
    setBusy(true)
    setError(null)
    try {
      qc.setQueryData(keys.me, await api.post<Me>("/me/policy", { version }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 pt-[calc(1.25rem+var(--top-inset))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <form onSubmit={accept} className="w-full max-w-[24rem] space-y-6 rounded-[2rem] bg-card px-6 pt-8 pb-7 shadow-(--shadow-card) sm:px-8">
        <Panda pose="wave" sizes="96px" className="mx-auto block w-20" />
        <AuthHeading title="Before you continue">Faldo&apos;s Terms of use and Privacy notice need your agreement.</AuthHeading>
        <PolicyAgreement checked={agreed} onCheckedChange={(value) => { setAgreed(value); setError(null) }} />
        {error && <AuthError>{error}</AuthError>}
        <button type="submit" disabled={busy} className={PRIMARY_PILL}>{busy && <Loader2 className="size-4 animate-spin" />} Continue</button>
        <button type="button" onClick={onSignOut} className="mx-auto flex h-11 items-center px-3 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline">
          Sign out
        </button>
      </form>
    </div>
  )
}
