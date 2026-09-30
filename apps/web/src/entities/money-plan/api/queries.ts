"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { MoneyPlan } from "@/shared/api/types"

export function useMoneyPlan() {
  return useQuery({ queryKey: keys.moneyPlan, queryFn: () => api.get<MoneyPlan>("/money-plan") })
}
