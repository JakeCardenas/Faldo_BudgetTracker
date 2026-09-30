"use client"

import { notFound, redirect } from "next/navigation"
import { use } from "react"
import { LargeTitle } from "@/shared/ui/ios/nav-header"
import { CurrencyConverter, EmergencyFund, LoanCalculator, QuickNotes, SplitBill, TaxCalculator, TOOLS } from "@/features/money-tools"
import { useMaskedAmounts } from "@/shared/lib/privacy"

const VIEWS: Record<string, React.ComponentType> = {
  split: SplitBill, loan: LoanCalculator, tax: TaxCalculator, currency: CurrencyConverter,
  "emergency-fund": EmergencyFund, notes: QuickNotes,
}

export default function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  useMaskedAmounts()
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
