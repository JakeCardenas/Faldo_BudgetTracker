import type { QueryClient } from "@tanstack/react-query"

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
  engagement: ["engagement"] as const,
  balanceHistory: (days: number) => ["balance-history", days] as const,
  notes: ["notes"] as const,
  planned: ["planned"] as const,
  challenges: ["challenges"] as const,
  moneyPlan: ["money-plan"] as const,
}

export async function invalidateFinancialData(qc: QueryClient, deletedId?: string) {
  const roots = ["dashboard", "pulse", "accounts", "transactions", "budget", "goals", "recurring", "upcoming", "debts",
    "insights", "forecast", "report", "health", "account-history", "tags", "receipts", "engagement", "balance-history", "planned", "money-plan",
    "challenges", "companion"]
  // A record that was just deleted isn't fetched again: it would only come back "not found", and its sheet, still
  // sliding away, would flash to a loading state.
  const predicate = deletedId ? (query: { queryKey: readonly unknown[] }) => !query.queryKey.includes(deletedId) : undefined
  for (const root of roots) void qc.invalidateQueries({ queryKey: [root], predicate })
}
