"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { FinancialNote } from "@/shared/api/types"

export function useNotes() {
  return useQuery({ queryKey: keys.notes, queryFn: () => api.get<FinancialNote[]>("/notes") })
}
