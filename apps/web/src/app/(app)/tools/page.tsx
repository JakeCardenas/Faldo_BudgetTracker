"use client"

import { ListGroup, ListRow } from "@/shared/ui/ios/list"
import { LargeTitle } from "@/shared/ui/ios/nav-header"
import { useMaskedAmounts } from "@/shared/lib/privacy"
import { TOOLS } from "@/features/money-tools"

export default function ToolsPage() {
  useMaskedAmounts()
  return (
    <div className="space-y-4">
      <LargeTitle title="Tools" subtitle="Calculators and helpers for everyday money" back={{ href: "/you", label: "Profile" }} />
      <ListGroup className="cascade">
        {TOOLS.map((tool) => <ListRow key={tool.slug} icon={tool.icon} title={tool.title} href={tool.href ?? `/tools/${tool.slug}`} />)}
      </ListGroup>
    </div>
  )
}
