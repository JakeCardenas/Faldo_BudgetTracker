"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Health, MonthlyReport } from "@/shared/api/types"

export function useReport(month: string) {
  return useQuery({ queryKey: keys.report(month), queryFn: () => api.get<MonthlyReport>("/reports/monthly", { month }), placeholderData: keepPreviousData })
}

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: () => api.get<Health>("/health") })
}
