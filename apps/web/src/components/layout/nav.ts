import {
  ArrowLeftRight, BarChart3, CalendarClock, HandCoins, Home, Landmark, Lightbulb, LineChart, PiggyBank, Settings,
  Sparkles, Target, type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/assistant", label: "Assistant", icon: Sparkles },
      { href: "/insights", label: "Insights", icon: Lightbulb },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/accounts", label: "Accounts", icon: Landmark },
      { href: "/bills", label: "Bills & recurring", icon: CalendarClock },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/budgets", label: "Budgets", icon: PiggyBank },
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/debts", label: "Money owed", icon: HandCoins },
    ],
  },
  {
    label: "Analyze",
    items: [
      { href: "/forecast", label: "Forecast", icon: LineChart },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings }

export const ALL_NAV = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM]

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}
