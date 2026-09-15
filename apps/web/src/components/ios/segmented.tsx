"use client"

import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

export function Segmented<T extends string>({ value, onChange, options, className, size = "md", label }: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode; tone?: "default" | "expense" | "income" }[]
  className?: string
  size?: "sm" | "md"
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full bg-muted p-1", className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => { if (!active) play("select"); onChange(option.value) }}
            className={cn("flex-1 rounded-full font-semibold whitespace-nowrap transition-all duration-200",
              size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm",
              active
                ? option.tone === "expense" ? "bg-expense text-white shadow-(--shadow-card) dark:text-[#1a0d0c]"
                  : option.tone === "income" ? "bg-income text-white shadow-(--shadow-card) dark:text-[#0c150e]"
                    : "bg-card text-foreground shadow-(--shadow-card)"
                : "text-muted-foreground hover:text-foreground")}>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Chip({ active, className, children, onClick, ...props }: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button type="button" aria-pressed={active} onClick={(e) => { play("select"); onClick?.(e) }} className={cn("pressable h-8 shrink-0 rounded-full border px-3.5 text-xs font-semibold whitespace-nowrap transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted", className)} {...props}>
      {children}
    </button>
  )
}
