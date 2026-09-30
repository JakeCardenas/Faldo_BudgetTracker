"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { PlannedPurchase } from "@/shared/api/types"

export function usePlanned() {
  return useQuery({ queryKey: keys.planned, queryFn: () => api.get<PlannedPurchase[]>("/planned-purchases") })
}
