"use client"

import { createContext, useContext, useState } from "react"

export type AuthDraft = { name: string; email: string; password: string }
type DraftState = [AuthDraft, (patch: Partial<AuthDraft>) => void]

const DraftContext = createContext<DraftState | null>(null)

/**
 * What's been typed on the sign-in screens, kept while moving between Log in, Sign up and Forgot password so switching
 * never empties the form. It lives in the shared layout, in memory only: never in storage, never in a URL.
 */
export function AuthDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<AuthDraft>({ name: "", email: "", password: "" })
  const update = (patch: Partial<AuthDraft>) => setDraft((d) => ({ ...d, ...patch }))
  return <DraftContext.Provider value={[draft, update]}>{children}</DraftContext.Provider>
}

export function useAuthDraft(): DraftState {
  const state = useContext(DraftContext)
  if (!state) throw new Error("useAuthDraft is used outside the sign-in screens")
  return state
}
