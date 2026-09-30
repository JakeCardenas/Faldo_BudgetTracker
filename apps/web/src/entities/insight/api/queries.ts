"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Insight } from "@/shared/api/types"

export function usePulse() {
  return useQuery({
    queryKey: keys.pulse,
    queryFn: () => api.get<{ text: string; generated_by: string; facts: Record<string, unknown> }>("/pulse"),
    staleTime: 5 * 60_000,
  })
}

export function useInsights() {
  return useQuery({ queryKey: keys.insights, queryFn: () => api.get<Insight[]>("/insights") })
}
