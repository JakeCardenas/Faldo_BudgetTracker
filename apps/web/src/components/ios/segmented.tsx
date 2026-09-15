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
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => { if (!active) play("select"); onChange(option.value) }}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200",
              size === "sm" ? "h-7 px-2.5 text-[0.8125rem]" : "h-8 px-3.5 text-sm",
              active
                ? cn("bg-card shadow-[0_1px_2px_rgb(15_20_17/0.08),0_0_0_0.5px_rgb(15_20_17/0.06)] dark:bg-[#2b302c] dark:shadow-none",
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
    <button type="button" aria-pressed={active} onClick={(e) => { play("select"); onClick?.(e) }} className={cn("pressable inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-[0.8125rem] font-medium whitespace-nowrap",
      active ? "border-primary/35 bg-secondary text-secondary-foreground" : "bg-card text-foreground hover:bg-accent", className)} {...props}>
      {children}
    </button>
  )
}
