"use client"

import { ListGroup, ListRow } from "@/components/ios/list"
import { LargeTitle } from "@/components/ios/nav-header"
import { useMaskedAmounts } from "@/lib/privacy"
import { TOOLS } from "@/lib/tools-catalog"

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
