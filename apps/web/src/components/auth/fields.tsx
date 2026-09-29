"use client"

import { useState } from "react"
import { Eye, EyeOff, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** The sign-in screens' full-width pill button: deep Faldo green, or a softer look for "or" choices. */
export const PILL = "pressable flex h-12 w-full items-center justify-center gap-2.5 rounded-full text-[0.9375rem] font-semibold transition-colors disabled:opacity-60"
export const PRIMARY_PILL = cn(PILL, "bg-[#1b3d24] text-white hover:bg-[#214a2c] dark:bg-[#2c7549] dark:hover:bg-[#33844f]")

/** A pill-shaped field with a small icon in front and the label read to screen readers (the placeholder shows it). */
export function AuthField({ icon: Icon, label, className, trailing, ...props }: React.ComponentProps<"input"> & {
  icon: LucideIcon
  label: string
  trailing?: React.ReactNode
}) {
  return (
    <label className={cn("flex h-12 items-center gap-3 rounded-full border border-border bg-card px-4 transition-[border-color,box-shadow]",
      "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25 dark:bg-input/20", className)}>
      <Icon aria-hidden className="size-[1.1rem] shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <span className="sr-only">{label}</span>
      <input placeholder={label} className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80 sm:text-[0.9375rem]" {...props} />
      {trailing}
    </label>
  )
}

/** A password field with the eye that shows or hides what's typed. */
export function PasswordField(props: Omit<React.ComponentProps<typeof AuthField>, "type" | "trailing">) {
  const [shown, setShown] = useState(false)
  return (
    <AuthField {...props} type={shown ? "text" : "password"} trailing={
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}
        className="hit -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
        {shown ? <EyeOff className="size-[1.1rem]" strokeWidth={1.8} /> : <Eye className="size-[1.1rem]" strokeWidth={1.8} />}
      </button>
    } />
  )
}

/** A thin line with "or" in the middle. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[0.8125rem] text-muted-foreground" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
