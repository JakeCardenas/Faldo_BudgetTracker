"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"

/** What this server offers before anyone signs in: Google and Apple buttons, and the demo. */
export type SignInOptions = { google: boolean; apple: boolean; demo: boolean }

export function useSignInOptions() {
  return useQuery({ queryKey: ["auth-providers"], queryFn: () => api.get<SignInOptions>("/auth/providers"), staleTime: 5 * 60_000 })
}

/**
 * The approved version of the Privacy notice and Terms that signing up agrees to. Null while they're drafts: sign-up
 * then asks for no agreement and records none (see POLICY_VERSION in the API).
 */
export function usePolicyVersion() {
  return useQuery({
    queryKey: ["auth-policy"],
    queryFn: async () => (await api.get<{ version: string | null }>("/auth/policy")).version,
    staleTime: 5 * 60_000,
  })
}
