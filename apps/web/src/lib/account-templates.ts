import type { AccountType } from "@/lib/types"

export const ACCOUNT_PALETTE = ["#1b63d6", "#0f9d6b", "#b3222a", "#e07800", "#6a34d1", "#11a39a", "#c2477f", "#5b6b5e", "#1e3f94", "#8a6a3f"]

export const ACCOUNT_GROUPS: { type: AccountType; label: string }[] = [
  { type: "e_wallet", label: "E-wallets" },
  { type: "bank", label: "Bank accounts" },
  { type: "cash", label: "Cash" },
  { type: "savings", label: "Savings" },
  { type: "credit_card", label: "Credit cards" },
  { type: "custom", label: "Other" },
]
