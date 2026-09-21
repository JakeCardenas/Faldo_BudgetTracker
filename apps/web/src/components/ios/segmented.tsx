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
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200",
              size === "sm" ? "h-7 px-3 text-[0.8125rem]" : "h-8 px-4 text-sm",
              active
                ? cn("bg-card shadow-[0_1px_3px_rgb(16_36_24/0.1),0_0_0_0.5px_rgb(16_36_24/0.05)] dark:bg-[#2b302c] dark:shadow-none",
                  option.tone === "expense" ? "text-expense" : option.tone === "income" ? "text-income" : "text-foreground")
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
    <button type="button" aria-pressed={active} onClick={(e) => { play("select"); onClick?.(e) }} className={cn("pressable inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[0.8125rem] font-medium whitespace-nowrap",
      active ? "bg-foreground text-background" : "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent", className)} {...props}>
      {children}
    </button>
  )
}
