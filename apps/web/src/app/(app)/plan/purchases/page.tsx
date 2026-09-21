"use client"

import { PlannedPurchases } from "@/components/decide/planned"
import { LargeTitle } from "@/components/ios/nav-header"

/** Things you want to buy: Faldo keeps checking each one against Safe to Spend. */
export default function PlannedPurchasesPage() {
  return (
    <div className="space-y-5">
      <LargeTitle title="Planned purchases" subtitle="Things you want to buy, and when they fit" back={{ href: "/plan", label: "Plan" }} />
      <PlannedPurchases />
    </div>
  )
}
