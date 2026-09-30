"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { invalidateFinancialData, keys } from "@/shared/api/query-keys"
import type { Transaction, TransactionInput, TransactionList, TransactionUpdate } from "@/shared/api/types"
import { useSubmissionKey } from "@/shared/api/use-submission-key"

export interface TransactionQuery {
  q?: string
  type?: string[]
  account_id?: string[]
  category_id?: string[]
  date_from?: string
  date_to?: string
  tag?: string
  sort?: string
  limit?: number
  cursor?: string
}

export function useTransactions(params: TransactionQuery) {
  return useQuery({
    queryKey: keys.transactions(params),
    queryFn: () => api.get<TransactionList>("/transactions", { ...params }),
    placeholderData: keepPreviousData,
  })
}

/**
 * Creates or edits a transaction. A new one is sent under one Idempotency-Key per submission, so a retry or double tap
 * records it once; an edit sends the version it was made from, so it can't silently overwrite a newer edit.
 */
export function useSaveTransaction() {
  const qc = useQueryClient()
  const submission = useSubmissionKey()
  return useMutation({
    mutationFn: (save: { id: string; data: TransactionInput; version: number } | { id?: undefined; data: TransactionInput }) =>
      save.id !== undefined
        ? api.put<Transaction>(`/transactions/${save.id}`, { ...save.data, version: save.version } satisfies TransactionUpdate)
        : api.postOnce<Transaction>("/transactions", save.data, submission.for(save.data)),
    onSuccess: (_, save) => {
      if (save.id === undefined) submission.done()
      return invalidateFinancialData(qc)
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`),
    onSuccess: (_, id) => invalidateFinancialData(qc, id),
  })
}
