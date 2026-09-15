"use client"

import { forwardRef } from "react"
import { cn } from "@/lib/utils"

export const AmountInput = forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "onChange" | "value" | "size"> & {
  value: string
  onValueChange: (value: string) => void
  size?: "default" | "lg"
}>(function AmountInput({ value, onValueChange, className, size = "default", ...props }, ref) {
  return (
    <div className={cn(
      "flex items-center rounded-lg border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25",
      size === "lg" ? "h-14 px-4" : "h-10 px-3",
      className,
    )}>
      <span className={cn("mr-1.5 text-muted-foreground", size === "lg" && "text-xl")}>₱</span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.,]/g, "")
          if (/^[\d,]*(\.\d{0,2})?$/.test(next)) onValueChange(next)
        }}
        className={cn("tabular w-full bg-transparent outline-none placeholder:text-muted-foreground/70", size === "lg" ? "text-2xl font-semibold tracking-[-0.02em]" : "text-base sm:text-sm")}
        {...props}
      />
    </div>
  )
})
