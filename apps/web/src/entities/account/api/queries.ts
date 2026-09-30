"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { keys } from "@/shared/api/query-keys"
import type { Account, BalancePoint } from "@/shared/api/types"

export function useAccounts(includeArchived = false) {
  return useQuery({ queryKey: [...keys.accounts, includeArchived], queryFn: () => api.get<Account[]>("/accounts", { include_archived: includeArchived }) })
}

export function useBalanceHistory(days = 7) {
  return useQuery({ queryKey: keys.balanceHistory(days), queryFn: () => api.get<BalancePoint[]>("/accounts/balance-history", { days }) })
}
