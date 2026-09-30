"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Debt } from "@/shared/api/types"

export function useDebts() {
  return useQuery({ queryKey: keys.debts, queryFn: () => api.get<Debt[]>("/debts") })
}
