"use client"

import { createContext, useContext } from "react"
import type { EntryPreset } from "@/components/capture/keypad-entry"
import type { Receipt } from "@/lib/types"

export type AddModeOption = "expense" | "income" | "transfer" | "describe" | "manual" | "receipt"

export interface AppActions {
  openAddTransaction: (options?: { mode?: AddModeOption; receipt?: Receipt; preset?: EntryPreset }) => void
  openMore: () => void
  openSearch: () => void
  openTransaction: (id: string) => void
}

export const AppActionsContext = createContext<AppActions | null>(null)

export function useAppActions() {
  const value = useContext(AppActionsContext)
  if (!value) throw new Error("useAppActions must be used inside AppShell")
  return value
}
