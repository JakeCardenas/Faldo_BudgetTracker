"use client"

import { Eye, EyeOff } from "lucide-react"
import { setAmountsHidden, useAmountsHidden } from "@/lib/privacy"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

/** The eye toggle for hiding amounts. Same control everywhere it appears. */
export function HideAmountsButton({ className, tone = "default" }: { className?: string; tone?: "default" | "light" }) {
  const hidden = useAmountsHidden()
  const Icon = hidden ? EyeOff : Eye
  return (
    <button type="button" aria-pressed={hidden} aria-label={hidden ? "Show amounts" : "Hide amounts"}
      onClick={() => { play(hidden ? "toggleOn" : "toggleOff"); setAmountsHidden(!hidden) }}
      className={cn("pressable flex size-8 items-center justify-center rounded-full transition-colors",
        tone === "light" ? "text-white/85 hover:bg-white/15 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground", className)}>
      <Icon className="size-[1.05rem]" strokeWidth={1.9} />
    </button>
  )
}
