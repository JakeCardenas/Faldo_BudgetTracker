import { Calculator, CircleDollarSign, Landmark, NotebookPen, PieChart, ReceiptText, Split, type LucideIcon } from "lucide-react"

export const TOOLS: { slug: string; title: string; description: string; icon: LucideIcon; tone: string }[] = [
  { slug: "split", title: "Split a bill", description: "Divide a bill and track who still owes you.", icon: Split, tone: "bg-income-soft text-income" },
  { slug: "loan", title: "Loan & installment calculator", description: "See the true cost of add-on rates and 0% plans.", icon: Calculator, tone: "bg-[#e8eefb] text-[#3f64b5] dark:bg-[#1d2740] dark:text-[#9db6ec]" },
  { slug: "tax", title: "Income tax calculator", description: "Estimate PH income tax and take-home pay.", icon: ReceiptText, tone: "bg-warning-soft text-warning" },
  { slug: "currency", title: "Currency converter", description: "Convert pesos for travel, remittances and shopping.", icon: CircleDollarSign, tone: "bg-secondary text-primary" },
  { slug: "emergency-fund", title: "Emergency fund", description: "Find your safety-net target and monthly plan.", icon: Landmark, tone: "bg-expense-soft text-expense" },
  { slug: "budget-planner", title: "50/30/20 planner", description: "Split your pay and compare with real spending.", icon: PieChart, tone: "bg-[#f3e8fb] text-[#7b3fb5] dark:bg-[#2d1f3a] dark:text-[#c7a1ec]" },
  { slug: "notes", title: "Quick notes", description: "Reminders, upcoming expenses and lists.", icon: NotebookPen, tone: "bg-muted text-foreground" },
]

