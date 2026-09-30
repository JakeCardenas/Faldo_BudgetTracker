"use client"

import { createContext, useContext } from "react"
import type { Receipt } from "@/shared/api/types"

/** Values to start the add sheet with (a scanned QR's amount and store, a template, a suggestion from chat). */
export interface EntryPreset {
  amount_minor?: number | null
  note?: string | null
  /** Who was paid, when it's known for sure (a scanned payment QR). */
  merchant?: string | null
  payment_method?: string | null
  category_id?: string | null
  account_id?: string | null
  to_account_id?: string | null
  occurred_on?: string
}

/** An amount and label to start Faldo Check with. */
export interface CheckPreset {
  amount_minor?: number
  label?: string
}

export type AddModeOption = "expense" | "income" | "transfer" | "describe" | "manual" | "receipt"

/**
 * What any screen can ask the app to open: the add sheet, the + menu, Faldo Check, search, a transaction. The app shell
 * (app/_shell) provides it; screens, widgets and features only call it, so none of them depends on the others.
 */
export interface AppActions {
  openAddTransaction: (options?: { mode?: AddModeOption; receipt?: Receipt; preset?: EntryPreset; text?: string }) => void
  /** The + menu: every way to record or plan money. */
  openAddMenu: () => void
  openCheck: (preset?: CheckPreset) => void
  openSearch: () => void
  openTransaction: (id: string) => void
}

export const AppActionsContext = createContext<AppActions | null>(null)

export function useAppActions() {
  const value = useContext(AppActionsContext)
  if (!value) throw new Error("useAppActions must be used inside AppShell")
  return value
}
