"use client"

import { notFound } from "next/navigation"
import { use } from "react"
import { LargeTitle } from "@/components/ios/nav-header"
import { CurrencyConverter } from "@/components/tools/currency"
import { EmergencyFund } from "@/components/tools/emergency"
import { LoanCalculator } from "@/components/tools/loan"
import { QuickNotes } from "@/components/tools/notes"
import { BudgetPlanner } from "@/components/tools/planner"
import { SplitBill } from "@/components/tools/split"
import { TaxCalculator } from "@/components/tools/tax"
import { TOOLS } from "@/lib/tools-catalog"

const VIEWS: Record<string, React.ComponentType> = {
  split: SplitBill, loan: LoanCalculator, tax: TaxCalculator, currency: CurrencyConverter,
  "emergency-fund": EmergencyFund, "budget-planner": BudgetPlanner, notes: QuickNotes,
}

export default function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = use(params)
  const meta = TOOLS.find((t) => t.slug === tool)
  const View = VIEWS[tool]
  if (!meta || !View) notFound()
  return (
    <div className="space-y-5">
      <LargeTitle title={meta.title} subtitle={meta.description} back={{ href: "/tools", label: "Tools" }} />
      <View />
    </div>
  )
}
