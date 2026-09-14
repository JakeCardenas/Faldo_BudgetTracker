"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type {
  Account,
  Budget,
  Category,
  Dashboard,
  Debt,
  Forecast,
  Goal,
  Health,
  Insight,
  Me,
  MonthlyReport,
  Recurring,
  Transaction,
  TransactionInput,
  TransactionList,
  UpcomingItem,
} from "@/lib/types"

export const keys = {
  me: ["me"] as const,
  dashboard: (range: string) => ["dashboard", range] as const,
  pulse: ["pulse"] as const,
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  transactions: (params: object) => ["transactions", params] as const,
  budget: (month: string) => ["budget", month] as const,
  goals: ["goals"] as const,
  recurring: ["recurring"] as const,
  upcoming: ["upcoming"] as const,
  debts: ["debts"] as const,
  insights: ["insights"] as const,
  forecast: (horizon: string) => ["forecast", horizon] as const,
  report: (month: string) => ["report", month] as const,
  health: ["health"] as const,
}

export async function invalidateFinancialData(qc: QueryClient) {
  const roots = ["dashboard", "pulse", "accounts", "transactions", "budget", "goals", "recurring", "upcoming", "debts",
    "insights", "forecast", "report", "health", "account-history", "tags", "receipts"]
  for (const root of roots) void qc.invalidateQueries({ queryKey: [root] })
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/me"), staleTime: 60_000, retry: false })
}

export function useDashboard(range: string) {
  return useQuery({ queryKey: keys.dashboard(range), queryFn: () => api.get<Dashboard>("/dashboard", { range }), placeholderData: keepPreviousData })
}

export function usePulse() {
  return useQuery({
    queryKey: keys.pulse,
    queryFn: () => api.get<{ text: string; generated_by: string; facts: Record<string, unknown> }>("/pulse"),
    staleTime: 5 * 60_000,
  })
}

export function useAccounts(includeArchived = false) {
  return useQuery({ queryKey: [...keys.accounts, includeArchived], queryFn: () => api.get<Account[]>("/accounts", { include_archived: includeArchived }) })
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: () => api.get<Category[]>("/categories"), staleTime: 5 * 60_000 })
}

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

export function useBudget(month: string) {
  return useQuery({ queryKey: keys.budget(month), queryFn: () => api.get<Budget>("/budgets", { month }), placeholderData: keepPreviousData })
}

export function useGoals() {
  return useQuery({ queryKey: keys.goals, queryFn: () => api.get<Goal[]>("/goals") })
}

export function useRecurring() {
  return useQuery({ queryKey: keys.recurring, queryFn: () => api.get<Recurring[]>("/recurring") })
}

export function useUpcoming(days = 30) {
  return useQuery({ queryKey: [...keys.upcoming, days], queryFn: () => api.get<UpcomingItem[]>("/recurring/upcoming", { days }) })
}

export function useDebts() {
  return useQuery({ queryKey: keys.debts, queryFn: () => api.get<Debt[]>("/debts") })
}

export function useInsights() {
  return useQuery({ queryKey: keys.insights, queryFn: () => api.get<Insight[]>("/insights") })
}

export function useForecast(horizon: string) {
  return useQuery({ queryKey: keys.forecast(horizon), queryFn: () => api.get<Forecast>("/forecast", { horizon }), placeholderData: keepPreviousData })
}

export function useReport(month: string) {
  return useQuery({ queryKey: keys.report(month), queryFn: () => api.get<MonthlyReport>("/reports/monthly", { month }), placeholderData: keepPreviousData })
}

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: () => api.get<Health>("/health") })
}

export function useSaveTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: TransactionInput }) =>
      id ? api.put<Transaction>(`/transactions/${id}`, data) : api.post<Transaction>("/transactions", data),
    onSuccess: () => invalidateFinancialData(qc),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`),
    onSuccess: () => invalidateFinancialData(qc),
  })
}
