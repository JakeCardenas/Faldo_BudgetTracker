import {
  BarChart3, BookOpen, Flame, History, Home, Lightbulb, MessageCircle, PiggyBank, Settings, Wallet, Wrench, type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const TAB_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/accounts", label: "Wallet", icon: Wallet },
  { href: "/plan", label: "Plan", icon: PiggyBank },
  { href: "/transactions", label: "History", icon: History },
]

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Money", items: [...TAB_ITEMS, { href: "/reports", label: "Statistics", icon: BarChart3 }] },
  {
    label: "Companion",
    items: [
      { href: "/assistant", label: "Talk to Faldo", icon: MessageCircle },
      { href: "/insights", label: "Insights", icon: Lightbulb },
      { href: "/streaks", label: "Streaks & rewards", icon: Flame },
      { href: "/learn", label: "Learn", icon: BookOpen },
      { href: "/tools", label: "Tools", icon: Wrench },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings }

export const ALL_NAV = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM]

const PLAN_ROUTES = ["/plan", "/budgets", "/goals", "/bills", "/debts", "/forecast"]

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  if (href === "/plan") return PLAN_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))
  return pathname === href || pathname.startsWith(`${href}/`)
}
