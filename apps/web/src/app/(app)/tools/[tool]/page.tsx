"use client"

import { notFound, redirect } from "next/navigation"
import { use } from "react"
import { LargeTitle } from "@/components/ios/nav-header"
import { CurrencyConverter } from "@/components/tools/currency"
import { EmergencyFund } from "@/components/tools/emergency"
import { LoanCalculator } from "@/components/tools/loan"
import { QuickNotes } from "@/components/tools/notes"
import { SplitBill } from "@/components/tools/split"
import { TaxCalculator } from "@/components/tools/tax"
import { TOOLS } from "@/lib/tools-catalog"

const VIEWS: Record<string, React.ComponentType> = {
  split: SplitBill, loan: LoanCalculator, tax: TaxCalculator, currency: CurrencyConverter,
  "emergency-fund": EmergencyFund, notes: QuickNotes,
}

export default function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = use(params)
  if (tool === "budget-planner" || tool === "money-plan") redirect("/plan/money")
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
