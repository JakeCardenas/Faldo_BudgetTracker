"use client"

import { Eye, EyeOff } from "lucide-react"
import { setAmountsHidden, useAmountsHidden } from "@/lib/privacy"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

/** The eye toggle for hiding amounts. Same control everywhere it appears. */
export function HideAmountsButton({ className }: { className?: string }) {
  const hidden = useAmountsHidden()
  const Icon = hidden ? EyeOff : Eye
  return (
    <button type="button" aria-pressed={hidden} aria-label={hidden ? "Show amounts" : "Hide amounts"}
      onClick={() => { play(hidden ? "toggleOn" : "toggleOff"); setAmountsHidden(!hidden) }}
      className={cn("pressable flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground", className)}>
      <Icon className="size-[1.05rem]" strokeWidth={1.9} />
    </button>
  )
}
