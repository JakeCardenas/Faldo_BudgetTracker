"use client"

import { forwardRef, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"

/** "20000.5" shown as "20,000.5": thousands grouped, up to two decimals kept as typed. */
function grouped(raw: string) {
  const [whole, fraction] = raw.split(".")
  const int = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return fraction === undefined ? int : `${int}.${fraction}`
}

/**
 * A peso amount field. It shows the number grouped as you type ("20,000") and keeps the caret beside the digit you
 * just typed, but hands the form the plain number ("20000"), so `toMinor` and every caller read it the same way.
 */
export const AmountInput = forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "onChange" | "value" | "size"> & {
  value: string
  onValueChange: (value: string) => void
  size?: "default" | "lg"
}>(function AmountInput({ value, onValueChange, className, size = "default", ...props }, ref) {
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => input.current as HTMLInputElement)

  return (
    <div className={cn(
      "flex items-center rounded-lg border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 dark:bg-input/20",
      // The same height as every other field (Input and Select are 44px), so an amount lines up with its button.
      size === "lg" ? "h-14 px-4" : "h-11 px-3",
      className,
    )}>
      <span className={cn("mr-1.5 text-muted-foreground", size === "lg" && "text-xl")}>₱</span>
      <input
        ref={input}
        inputMode="decimal"
        autoComplete="off"
        value={grouped(value.replace(/,/g, ""))}
        onChange={(e) => {
          const el = e.target
          const typed = el.value
          const before = typed.slice(0, el.selectionStart ?? typed.length).replace(/[^\d.]/g, "").length
          const raw = typed.replace(/[^\d.]/g, "")
          if (!/^\d*(\.\d{0,2})?$/.test(raw)) return
          onValueChange(raw)
          // Put the caret back after the same number of digits once the grouped value has rendered.
          requestAnimationFrame(() => {
            const shown = el.value
            let seen = 0
            let at = 0
            while (at < shown.length && seen < before) {
              if (/[\d.]/.test(shown[at])) seen++
              at++
            }
            if (document.activeElement === el) el.setSelectionRange(at, at)
          })
        }}
        className={cn("tabular w-full bg-transparent outline-none placeholder:text-muted-foreground/70", size === "lg" ? "text-2xl font-semibold tracking-[-0.02em]" : "text-base sm:text-sm")}
        {...props}
      />
    </div>
  )
})
