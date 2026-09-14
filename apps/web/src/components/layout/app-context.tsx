"use client"

import { createContext, useContext } from "react"
import type { Receipt } from "@/lib/types"

export interface AppActions {
  openAddTransaction: (options?: { mode?: "describe" | "manual" | "receipt"; receipt?: Receipt }) => void
  openSearch: () => void
  openTransaction: (id: string) => void
}

export const AppActionsContext = createContext<AppActions | null>(null)

export function useAppActions() {
  const value = useContext(AppActionsContext)
  if (!value) throw new Error("useAppActions must be used inside AppShell")
  return value
}
