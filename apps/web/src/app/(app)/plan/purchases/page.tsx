"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { PlannedPurchases } from "@/components/decide/planned"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { useMaskedAmounts } from "@/lib/privacy"

/** Things you want to buy: Faldo keeps checking each one against Safe to Spend. */
export default function PlannedPurchasesPage() {
  useMaskedAmounts()
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-5">
      <LargeTitle title="Planned purchases" subtitle="Things you want to buy, and when they fit" back={{ href: "/plan", label: "Plan" }}
        actions={<HeaderButton onClick={() => setAdding(true)} aria-label="Plan a purchase"><Plus /><span className="max-lg:sr-only">Add</span></HeaderButton>} />
      <PlannedPurchases adding={adding} onAddingChange={setAdding} />
    </div>
  )
}
