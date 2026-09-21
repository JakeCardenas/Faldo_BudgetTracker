import {
  BarChart3, BookOpen, CalendarRange, CircleUserRound, Flame, FileUp, History, Home, Lightbulb, MessageCircle, Settings, Wallet, Wrench,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

/**
 * The four places in Faldo's tab bar: today, where your money lives, what's ahead and what happened.
 * The + (record money) sits beside them, and Profile is reached from the avatar button.
 */
export const TAB_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/accounts", label: "Wallet", icon: Wallet },
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/transactions", label: "History", icon: History },
]

export const PROFILE_ITEM: NavItem = { href: "/you", label: "Profile", icon: CircleUserRound }

/** Everything that lives under Profile, in the order the Profile page lists it. */
export const YOU_GROUPS: { label: string; items: (NavItem & { description: string })[] }[] = [
  {
    label: "Money",
    items: [
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

export const ALL_NAV: NavItem[] = [...TAB_ITEMS, PROFILE_ITEM, ...YOU_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM]

/** Pages that belong to each tab, so the tab stays selected inside them. Profile pages select no tab. */
const TAB_ROUTES: Record<string, string[]> = {
  "/": [],
  "/accounts": ["/accounts", "/import"],
  "/plan": ["/plan", "/budgets", "/goals", "/bills", "/debts", "/forecast"],
  "/transactions": ["/transactions", "/reports", "/insights"],
}

const matches = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`)

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  const routes = TAB_ROUTES[href]
  if (routes) return routes.some((r) => matches(pathname, r))
  return matches(pathname, href)
}

export function activeTabIndex(pathname: string) {
  return TAB_ITEMS.findIndex((item) => isActive(pathname, item.href))
}
