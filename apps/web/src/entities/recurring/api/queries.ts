"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Recurring, UpcomingItem } from "@/shared/api/types"

export function useRecurring() {
  return useQuery({ queryKey: keys.recurring, queryFn: () => api.get<Recurring[]>("/recurring") })
}

export function useUpcoming(days = 30) {
  return useQuery({ queryKey: [...keys.upcoming, days], queryFn: () => api.get<UpcomingItem[]>("/recurring/upcoming", { days }) })
}
