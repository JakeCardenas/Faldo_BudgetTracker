"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Dashboard } from "@/shared/api/types"

export function useDashboard(range: string) {
  return useQuery({ queryKey: keys.dashboard(range), queryFn: () => api.get<Dashboard>("/dashboard", { range }), placeholderData: keepPreviousData })
}
