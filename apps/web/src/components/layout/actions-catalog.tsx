import {
  ArrowLeftRight, BarChart3, BookOpen, CalendarClock, Calculator, CircleDollarSign, CreditCard, Flag, Flame, HandCoins,
  Landmark, Lightbulb, LineChart, MessageCircle, Minus, NotebookPen, PiggyBank, Plus, ReceiptText, ScanLine, Scale, Settings,
  Split, Wallet, Wrench, type LucideIcon,
} from "lucide-react"

export type QuickActionKind = "expense" | "income" | "transfer" | "receipt"

export interface QuickAction {
  id: string
  label: string
  icon: LucideIcon
  href?: string
  add?: QuickActionKind
  check?: boolean
  group: "Log" | "Plan" | "Understand" | "Tools"
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: "add_expense", label: "Expense", icon: Minus, add: "expense", group: "Log" },
  { id: "add_income", label: "Income", icon: Plus, add: "income", group: "Log" },
  { id: "transfer", label: "Transfer", icon: ArrowLeftRight, add: "transfer", group: "Log" },
  { id: "scan_receipt", label: "Scan receipt", icon: ScanLine, add: "receipt", group: "Log" },
  { id: "talk", label: "Talk to Faldo", icon: MessageCircle, href: "/assistant", group: "Log" },
  { id: "check", label: "Faldo Check", icon: Scale, check: true, group: "Plan" },
  { id: "budgets", label: "Budgets", icon: PiggyBank, href: "/budgets", group: "Plan" },
  { id: "goals", label: "Goals", icon: Flag, href: "/goals", group: "Plan" },
  { id: "bills", label: "Planned", icon: CalendarClock, href: "/bills", group: "Plan" },
  { id: "installments", label: "Installments", icon: CreditCard, href: "/plan#installments", group: "Plan" },
  { id: "debts", label: "Money owed", icon: HandCoins, href: "/debts", group: "Plan" },
  { id: "forecast", label: "Forecast", icon: LineChart, href: "/forecast", group: "Plan" },
  { id: "wallet", label: "Wallet", icon: Wallet, href: "/accounts", group: "Understand" },
  { id: "statistics", label: "Statistics", icon: BarChart3, href: "/reports", group: "Understand" },
  { id: "insights", label: "Insights", icon: Lightbulb, href: "/insights", group: "Understand" },
  { id: "streaks", label: "Streaks", icon: Flame, href: "/streaks", group: "Understand" },
  { id: "learn", label: "Learn", icon: BookOpen, href: "/learn", group: "Understand" },
  { id: "split", label: "Split bill", icon: Split, href: "/tools/split", group: "Tools" },
  { id: "notes", label: "Notes", icon: NotebookPen, href: "/tools/notes", group: "Tools" },
  { id: "currency", label: "Currency", icon: CircleDollarSign, href: "/tools/currency", group: "Tools" },
  { id: "tax", label: "Tax calculator", icon: ReceiptText, href: "/tools/tax", group: "Tools" },
  { id: "loan", label: "Loan calculator", icon: Calculator, href: "/tools/loan", group: "Tools" },
  { id: "emergency", label: "Emergency fund", icon: Landmark, href: "/tools/emergency-fund", group: "Tools" },
  { id: "tools", label: "All tools", icon: Wrench, href: "/tools", group: "Tools" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings", group: "Tools" },
]

export const DEFAULT_QUICK_ACTIONS = ["check", "budgets", "goals", "debts", "bills"]

export function resolveQuickActions(ids: string[] | undefined) {
  const chosen = (ids?.length ? ids : DEFAULT_QUICK_ACTIONS).map((id) => QUICK_ACTIONS.find((a) => a.id === id)).filter(Boolean)
  return chosen as QuickAction[]
}
