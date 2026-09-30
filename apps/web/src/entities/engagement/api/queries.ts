"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { ChallengeProgress, Engagement } from "@/shared/api/types"

export function useEngagement() {
  return useQuery({ queryKey: keys.engagement, queryFn: () => api.get<Engagement>("/engagement"), staleTime: 60_000 })
}

export function useChallenges() {
  return useQuery({ queryKey: keys.challenges, queryFn: () => api.get<ChallengeProgress[]>("/challenges") })
}
