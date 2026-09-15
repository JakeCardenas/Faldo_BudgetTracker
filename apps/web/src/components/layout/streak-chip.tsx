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
      className={cn("pressable flex h-9 items-center gap-1 rounded-full px-3 text-sm font-extrabold",
        data?.logged_today ? "bg-[#fff0e0] text-[#c75a12] dark:bg-[#3a2716] dark:text-[#ffb26b]" : "bg-muted text-muted-foreground", className)}>
      <Flame className={cn("size-4", data?.logged_today && "animate-flicker fill-current")} strokeWidth={2.2} />
      <span className="tabular">x{streak}</span>
    </Link>
  )
}
