import { Calculator, CircleDollarSign, Landmark, NotebookPen, PieChart, ReceiptText, Split, type LucideIcon } from "lucide-react"

export const TOOLS: { slug: string; title: string; description: string; icon: LucideIcon; href?: string }[] = [
  { slug: "split", title: "Split a bill", description: "Divide a bill and track who still owes you.", icon: Split },
  { slug: "loan", title: "Loan & installment calculator", description: "See the true cost of add-on rates and 0% plans.", icon: Calculator },
  { slug: "tax", title: "Income tax calculator", description: "Estimate PH income tax and take-home pay.", icon: ReceiptText },
  { slug: "currency", title: "Currency converter", description: "Convert pesos for travel, remittances and shopping.", icon: CircleDollarSign },
  { slug: "emergency-fund", title: "Emergency fund", description: "Find your safety-net target and monthly plan.", icon: Landmark },
  { slug: "money-plan", title: "Money plan", description: "Give each payday a job. 60/20/20 is one starting point.", icon: PieChart, href: "/plan/money" },
  { slug: "notes", title: "Quick notes", description: "Reminders, upcoming expenses and lists.", icon: NotebookPen },
]

