"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"

export interface Checkin { key: string; kind: string; priority: number; title: string; body: string; prompt: string; mood: string; href: string | null }

/** What Faldo would bring up first, and chat starters from the user's own situation. */
export function useCompanion() {
  return useQuery({
    queryKey: ["companion"],
    queryFn: () => api.get<{ checkins: Checkin[]; starters: { prompt: string; label: string; mood: string }[] }>("/assistant/companion"),
    staleTime: 5 * 60_000,
  })
}
