"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Goal } from "@/shared/api/types"

export function useGoals() {
  return useQuery({ queryKey: keys.goals, queryFn: () => api.get<Goal[]>("/goals") })
}
