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
            className={cn("hit flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200",
              // Tighter on the smallest phones (320pt), so four options still fit the width.
              size === "sm" ? "h-7 px-1.5 text-[0.8125rem] min-[375px]:px-3" : "h-8 px-2.5 text-sm min-[375px]:px-4",
              active
                ? cn("bg-card shadow-[0_1px_3px_rgb(16_36_24/0.1),0_0_0_0.5px_rgb(16_36_24/0.05)] dark:bg-accent dark:shadow-none",
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
    <button type="button" aria-pressed={active} onClick={(e) => { play("select"); onClick?.(e) }} className={cn("pressable hit inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[0.8125rem] font-medium whitespace-nowrap",
      active ? "bg-foreground text-background" : "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent", className)} {...props}>
      {children}
    </button>
  )
}

/**
 * Threads-style tabs: words on a hairline, the chosen one in full colour with an underline that glides
 * to it on a spring. For switching what a list shows (All, Expenses, Income, Transfers).
 */
export function UnderlineTabs<T extends string>({ value, onChange, options, label, className }: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode }[]
  label: string
  className?: string
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative flex border-b border-border/70", className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => { if (!active) play("select"); onChange(option.value) }}
            className={cn("h-10 flex-1 text-[0.875rem] font-semibold tracking-[-0.005em] whitespace-nowrap transition-colors duration-200 outline-none focus-visible:text-foreground",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {option.label}
          </button>
        )
      })}
      <span aria-hidden className="absolute -bottom-px left-0 h-0.5 rounded-full bg-foreground transition-transform duration-[380ms] ease-(--ease-spring)"
        style={{ width: `${100 / options.length}%`, transform: `translateX(${index * 100}%)` }} />
    </div>
  )
}
