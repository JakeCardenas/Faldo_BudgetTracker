"use client"

import Link from "next/link"
import { LargeTitle } from "@/components/ios/nav-header"
import { TOOLS } from "@/lib/tools-catalog"

export default function ToolsPage() {
  return (
    <div className="space-y-5">
      <LargeTitle title="Tools" subtitle="Calculators and helpers for everyday money" back={{ href: "/you", label: "Profile" }} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <Link key={tool.slug} href={tool.href ?? `/tools/${tool.slug}`} className="card-surface pressable flex items-start gap-3.5 p-4 hover:border-input">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/75"><Icon className="size-5" strokeWidth={1.75} /></span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-medium">{tool.title}</span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted-foreground">{tool.description}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
