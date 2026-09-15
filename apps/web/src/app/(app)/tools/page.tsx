"use client"

import Link from "next/link"
import { LargeTitle } from "@/components/ios/nav-header"
import { TOOLS } from "@/lib/tools-catalog"

export default function ToolsPage() {
  return (
    <div className="space-y-5">
      <LargeTitle title="Tools" subtitle="Handy calculators and helpers for everyday money." back={{ href: "/", label: "Home" }} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className="card-surface pressable flex items-start gap-4 p-5">
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${tool.tone}`}><Icon className="size-6" /></span>
              <span className="min-w-0">
                <span className="block text-base font-extrabold tracking-tight">{tool.title}</span>
                <span className="block text-sm text-muted-foreground">{tool.description}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
