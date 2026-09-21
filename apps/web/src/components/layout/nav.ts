import {
  BarChart3, BookOpen, CircleUserRound, Flame, FileUp, Home, Lightbulb, MessageCircle, ReceiptText, Settings, Target, Wallet, Wrench,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

/** The four places in Faldo: money now, money past, money ahead, and you. */
export const TAB_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Activity", icon: ReceiptText },
  { href: "/plan", label: "Plans", icon: Target },
  { href: "/you", label: "You", icon: CircleUserRound },
]

/** Everything that lives under You, in the order the You page lists it. */
export const YOU_GROUPS: { label: string; items: (NavItem & { description: string })[] }[] = [
  {
    label: "Money",
    items: [
      { href: "/accounts", label: "Accounts", icon: Wallet, description: "Wallets, banks, cards and savings" },
      { href: "/import", label: "Import a statement", icon: FileUp, description: "Bring in a bank or e-wallet CSV" },
      { href: "/reports", label: "Statistics", icon: BarChart3, description: "Where your money went, month by month" },
    ],
  },
  {
    label: "Faldo",
    items: [
      { href: "/assistant", label: "Talk to Faldo", icon: MessageCircle, description: "Ask about your money in plain words" },
      { href: "/insights", label: "Insights", icon: Lightbulb, description: "Patterns Faldo noticed in your spending" },
      { href: "/learn", label: "Learn", icon: BookOpen, description: "Short money lessons for the Philippines" },
      { href: "/streaks", label: "Streaks and rewards", icon: Flame, description: "Your logging streak and unlocks" },
      { href: "/tools", label: "Tools", icon: Wrench, description: "Split a bill, loans, tax and more" },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings }

export const ALL_NAV: NavItem[] = [...TAB_ITEMS, ...YOU_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM]

const TAB_ROUTES: Record<string, string[]> = {
  "/": ["/accounts", "/import"],
  "/transactions": ["/transactions", "/reports", "/insights"],
  "/plan": ["/plan", "/budgets", "/goals", "/bills", "/debts", "/forecast"],
  "/you": ["/you", "/settings", "/streaks", "/learn", "/tools", "/assistant"],
}

const matches = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`)

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || TAB_ROUTES["/"].some((r) => matches(pathname, r))
  const routes = TAB_ROUTES[href]
  if (routes) return routes.some((r) => matches(pathname, r))
  return matches(pathname, href)
}

export function activeTabIndex(pathname: string) {
  return TAB_ITEMS.findIndex((item) => isActive(pathname, item.href))
}
