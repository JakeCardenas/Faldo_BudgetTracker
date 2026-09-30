"use client"

import { useId, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/shared/lib/utils"

/** The sign-in screens' full-width pill button: deep Faldo green, or a softer look for "or" choices. */
export const PILL = "pressable flex h-12 w-full items-center justify-center gap-2.5 rounded-[0.875rem] text-[0.9375rem] font-semibold transition-colors disabled:opacity-60"
export const PRIMARY_PILL = cn(PILL, "bg-primary text-primary-foreground hover:bg-primary/90")

// 48px tall (past the 44px a thumb needs), 16px text so iOS doesn't zoom in, and Safari's own Caps Lock badge hidden:
// it would sit beside the eye button, and the password field says it in words instead.
// Placeholders at 90% of the muted text: 4.8:1 on the white fill and 5.2:1 on the dark one (normal-size text needs
// 4.5:1), still well below the labels (about 18:1 and 12:1), so they read as examples, not as the field's name.
const INPUT = cn("h-12 w-full rounded-[0.875rem] border border-border bg-card px-4 text-base outline-none transition-[border-color,box-shadow]",
  "placeholder:text-muted-foreground/90 focus:border-ring focus:ring-3 focus:ring-ring/25 sm:text-[0.9375rem] dark:bg-input/20",
  "[&::-webkit-caps-lock-indicator]:hidden")

type FieldProps = React.ComponentProps<"input"> & {
  label: string
  /** Beside the label, on the right: "Forgot password?". */
  action?: React.ReactNode
  /** Guidance that has to stay visible while typing (a placeholder disappears): "At least 10 characters." */
  hint?: React.ReactNode
  /** Inside the field, on the right: the eye button. */
  trailing?: React.ReactNode
  /** Below the hint: the Caps Lock note. */
  footer?: React.ReactNode
}

/**
 * A field with its label above it, so the label never disappears the way a placeholder does, and anything a placeholder
 * shows is only an example. Emails and passwords are typed exactly: no auto-capitalised first letter or autocorrect (a
 * field can opt back in).
 */
export function AuthField({ label, action, hint, trailing, footer, id, className, ...props }: FieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <label htmlFor={inputId} className="text-sm font-medium">{label}</label>
        {action}
      </div>
      <div className="relative">
        <input id={inputId} aria-describedby={hintId} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          className={cn(INPUT, trailing && "pr-12", className)} {...props} />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>
      {hint && <p id={hintId} className="px-1 text-xs text-muted-foreground">{hint}</p>}
      {footer}
    </div>
  )
}

/** A password field with the eye that shows or hides what's typed, and a word when Caps Lock is on. */
export function PasswordField({ onKeyDown, onKeyUp, onBlur, ...props }: Omit<FieldProps, "type" | "trailing" | "footer">) {
  const [shown, setShown] = useState(false)
  const [caps, setCaps] = useState(false)
  // Physical keyboards report Caps Lock; phones show it on their own keyboard.
  const readCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false)
  return (
    <AuthField {...props} type={shown ? "text" : "password"}
      onKeyDown={(e) => { readCaps(e); onKeyDown?.(e) }}
      onKeyUp={(e) => { readCaps(e); onKeyUp?.(e) }}
      onBlur={(e) => { setCaps(false); onBlur?.(e) }}
      trailing={
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}
          className="hit flex size-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
          {shown ? <EyeOff className="size-[1.1rem]" strokeWidth={1.8} /> : <Eye className="size-[1.1rem]" strokeWidth={1.8} />}
        </button>
      }
      footer={<p role="status" className="px-1 text-xs font-medium text-warning empty:hidden">{caps ? "Caps Lock is on" : ""}</p>} />
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

/** The screen's title and one line under it. */
export function AuthHeading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-center">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.025em]">{title}</h1>
      <p className="text-[0.9375rem] text-muted-foreground">{children}</p>
    </div>
  )
}

/** A form error, read out when it appears. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">{children}</p>
}
