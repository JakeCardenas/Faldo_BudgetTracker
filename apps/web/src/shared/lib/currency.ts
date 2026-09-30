const SYMBOLS: Record<string, string> = { PHP: "₱", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", GBP: "£" }

/**
 * The signed-in person's currency, the default for every amount shown. The app shell sets it from their settings
 * before any page draws, so screens that don't pass a currency still show theirs, not pesos.
 */
let display = "PHP"

export function setDisplayCurrency(currency: string | null | undefined) {
  display = currency || "PHP"
}

export function displayCurrency() {
  return display
}

/** Every currency sign Faldo writes, longest first (S$ before $), for reading or masking amounts in text. */
export const CURRENCY_SIGNS = Object.values(SYMBOLS).sort((a, b) => b.length - a.length)

/** The currencies onboarding offers. */
export const SUPPORTED_CURRENCIES = ["PHP", "USD", "SGD", "EUR"] as const

export function currencySymbol(currency: string = display) {
  return SYMBOLS[currency] ?? `${currency} `
}

export function formatCurrency(
  minor: number,
  currency: string = display,
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
