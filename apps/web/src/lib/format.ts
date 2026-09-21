import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from "date-fns"
import { amountsHidden } from "@/lib/privacy"

const SYMBOLS: Record<string, string> = { PHP: "₱", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", GBP: "£" }

export function currencySymbol(currency = "PHP") {
  return SYMBOLS[currency] ?? `${currency} `
}

export function formatMoney(
  minor: number,
  currency = "PHP",
  options: { signed?: boolean; cents?: boolean; compact?: boolean; reveal?: boolean } = {},
) {
  if (amountsHidden() && !options.reveal) return `${currencySymbol(currency)}••••`
  const negative = minor < 0
  const absolute = Math.abs(minor) / (currency === "JPY" ? 1 : 100)
  const showCents = options.cents ?? !Number.isInteger(absolute)
  let body: string
  if (options.compact && absolute >= 1000) {
    body = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 }).format(absolute)
  } else {
    body = new Intl.NumberFormat("en-PH", {
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0,
    }).format(absolute)
  }
  const sign = negative ? "−" : options.signed && minor > 0 ? "+" : ""
  return `${sign}${currencySymbol(currency)}${body}`
}

export function toMinor(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "").trim()
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const [whole, fraction = ""] = cleaned.split(".")
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2))
}

export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return ""
  const whole = Math.trunc(minor / 100)
  const cents = Math.abs(minor % 100)
  return cents ? `${whole}.${String(cents).padStart(2, "0")}` : String(whole)
}

export function formatDate(value: string, pattern = "MMM d, yyyy") {
  return format(parseISO(value), pattern)
}

export function formatDayLabel(value: string) {
  const date = parseISO(value)
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "EEEE, MMM d")
}

export function relativeDays(days: number) {
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  return `In ${days} days`
}

export function timeAgo(value: string) {
  return formatDistanceToNowStrict(parseISO(value), { addSuffix: true })
}

export function formatPct(value: number | null | undefined, signed = false) {
  if (value === null || value === undefined) return "n/a"
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${signed && value > 0 ? "+" : ""}${rounded}%`
}

export function todayISO() {
  const now = new Date()
  return format(now, "yyyy-MM-dd")
}

export function monthKey(date = new Date()) {
  return format(date, "yyyy-MM")
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  e_wallet: "E-wallet",
  credit_card: "Credit card",
  savings: "Savings",
  custom: "Custom",
}

export const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semi_monthly: "Twice a month",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  once: "One time",
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}
