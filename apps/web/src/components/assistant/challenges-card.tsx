"use client"

import Link from "next/link"
import { CheckCircle2, Flame } from "lucide-react"
import { ProgressBar } from "@/components/finance/progress-bar"
import type { Block } from "@/lib/types"
import { cn } from "@/lib/utils"

type Challenges = Extract<Block, { type: "challenges" }>

/** How the user's challenges are going, worked out from their own records. */
export function ChallengesCard({ block }: { block: Challenges }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <p className="truncate text-sm font-medium">{block.title}</p>
        <Link href="/streaks" className="shrink-0 text-xs font-medium text-primary">All</Link>
      </div>
      <ul className="divide-y divide-border/70">
        {block.items.map((item) => (
          <li key={item.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-1.5 text-[0.9375rem] font-semibold tracking-[-0.01em]">
                {item.state === "completed" ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <Flame className={cn("size-4 shrink-0", item.on_track ? "text-primary" : "text-warning")} />}
                <span className="truncate">{item.title}</span>
              </p>
              <p className="tabular shrink-0 text-xs text-muted-foreground">{item.state === "completed" ? "Done" : `${item.days_left} days left`}</p>
            </div>
            <ProgressBar className="mt-2 h-2" value={item.pct} status={item.state === "missed" ? "over" : item.on_track ? "on_track" : "near_limit"} label={`${item.title} ${Math.round(item.pct)}%`} />
            <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{item.summary}{item.next_step ? ` · ${item.next_step}` : ""}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
