"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Budget } from "@/shared/api/types"

export function useBudget(month: string) {
  return useQuery({ queryKey: keys.budget(month), queryFn: () => api.get<Budget>("/budgets", { month }), placeholderData: keepPreviousData })
}
