const SYMBOLS: Record<string, string> = { PHP: "₱", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", GBP: "£" }

/** The currencies onboarding offers. */
export const SUPPORTED_CURRENCIES = ["PHP", "USD", "SGD", "EUR"] as const

export function currencySymbol(currency = "PHP") {
  return SYMBOLS[currency] ?? `${currency} `
}

export function formatCurrency(
  minor: number,
  currency = "PHP",
  options: { signed?: boolean; cents?: boolean; compact?: boolean } = {},
) {
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
