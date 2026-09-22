import {
  BarChart3, BookOpen, CalendarRange, CircleUserRound, Flame, FileUp, History, House, Lightbulb, MessageCircle, Settings, WalletMinimal, Wrench,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export interface TabItem extends NavItem {
  /**
   * For the tab bar's filled icon: hides every shape of the icon except the details that are cut out
   * of the solid version (a wallet's clasp, a calendar's lines, a clock's hands). Empty for icons that
   * are simply solid when filled.
   */
  cutout: string
}

/**
 * The four places in Faldo's tab bar: today, where your money lives, what's ahead and what happened.
 * The + (record money) sits in the middle of them, and Profile is reached from the avatar button.
 */
export const TAB_ITEMS: TabItem[] = [
  { href: "/", label: "Home", icon: House, cutout: "" },
  { href: "/accounts", label: "Wallet", icon: WalletMinimal, cutout: "[&>:not(:nth-child(1))]:hidden" },
  { href: "/plan", label: "Plan", icon: CalendarRange, cutout: "[&>:not(:nth-child(3),:nth-child(n+5))]:hidden" },
  { href: "/transactions", label: "History", icon: History, cutout: "[&>:not(:nth-child(3))]:hidden" },
]

export const PROFILE_ITEM: NavItem = { href: "/you", label: "Profile", icon: CircleUserRound }

/** Everything reachable from Profile and the pages around it, for search. The Profile menu itself is shorter (see you/page.tsx). */
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
