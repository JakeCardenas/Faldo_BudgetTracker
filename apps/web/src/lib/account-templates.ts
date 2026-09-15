import type { AccountType } from "@/lib/types"

export interface AccountTemplate {
  name: string
  type: AccountType
  institution: string
  color: string
}

export const ACCOUNT_TEMPLATES: AccountTemplate[] = [
  { name: "GCash", type: "e_wallet", institution: "GCash", color: "#1b63d6" },
  { name: "Maya", type: "e_wallet", institution: "Maya", color: "#0f9d6b" },
  { name: "GrabPay", type: "e_wallet", institution: "Grab", color: "#00a650" },
  { name: "ShopeePay", type: "e_wallet", institution: "Shopee", color: "#e5532d" },
  { name: "Cash", type: "cash", institution: "Wallet", color: "#5b6b5e" },
  { name: "BPI Savings", type: "bank", institution: "BPI", color: "#b3222a" },
  { name: "BDO Savings", type: "bank", institution: "BDO", color: "#1e3f94" },
  { name: "Metrobank", type: "bank", institution: "Metrobank", color: "#23408f" },
  { name: "UnionBank", type: "bank", institution: "UnionBank", color: "#e07800" },
  { name: "Security Bank", type: "bank", institution: "Security Bank", color: "#0a8fc7" },
  { name: "Landbank", type: "bank", institution: "Landbank", color: "#128a44" },
  { name: "RCBC", type: "bank", institution: "RCBC", color: "#1f5aa8" },
  { name: "GoTyme", type: "savings", institution: "GoTyme Bank", color: "#11a39a" },
  { name: "SeaBank", type: "savings", institution: "SeaBank", color: "#f06a1d" },
  { name: "Maribank", type: "savings", institution: "Maribank", color: "#e8742a" },
  { name: "CIMB", type: "savings", institution: "CIMB", color: "#8a1538" },
  { name: "Tonik", type: "savings", institution: "Tonik", color: "#6a34d1" },
  { name: "BPI Credit Card", type: "credit_card", institution: "BPI", color: "#7c1f25" },
  { name: "BDO Credit Card", type: "credit_card", institution: "BDO", color: "#2b4aa0" },
  { name: "Metrobank Card", type: "credit_card", institution: "Metrobank", color: "#324b8a" },
]

export const ACCOUNT_PALETTE = ["#1b63d6", "#0f9d6b", "#b3222a", "#e07800", "#6a34d1", "#11a39a", "#c2477f", "#5b6b5e", "#1e3f94", "#8a6a3f"]

export const ACCOUNT_GROUPS: { type: AccountType; label: string }[] = [
  { type: "e_wallet", label: "E-wallets" },
  { type: "bank", label: "Bank accounts" },
  { type: "cash", label: "Cash" },
  { type: "savings", label: "Savings" },
  { type: "credit_card", label: "Credit cards" },
  { type: "custom", label: "Other" },
]
