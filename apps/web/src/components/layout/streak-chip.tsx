"use client"

import Link from "next/link"
import { Flame } from "lucide-react"
import { useEngagement } from "@/lib/queries"
import { cn } from "@/lib/utils"

export function StreakChip({ className }: { className?: string }) {
  const { data } = useEngagement()
  const streak = data?.current_streak ?? 0
  return (
    <Link href="/streaks" aria-label={`${streak}-day streak`}
      className={cn("pressable flex h-8 items-center gap-1 rounded-lg px-2 text-[0.8125rem] font-semibold hover:bg-accent",
        data?.logged_today ? "text-warning" : "text-muted-foreground", className)}>
      <Flame className={cn("size-4", data?.logged_today && "fill-warning/20")} strokeWidth={2} />
      <span className="tabular">{streak}</span>
    </Link>
  )
}
