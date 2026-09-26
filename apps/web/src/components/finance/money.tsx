"use client"

import { useEffect, useRef, useState } from "react"
import { currencySymbol, formatMoney } from "@/lib/format"
import { useMotionReduced } from "@/lib/motion"
import { amountsHidden } from "@/lib/privacy"
import { cn } from "@/lib/utils"

interface MoneyProps {
  minor: number
  currency?: string
  signed?: boolean
  cents?: boolean
  compact?: boolean
  className?: string
  tone?: "auto" | "none"
}

export function Money({ minor, currency = "PHP", signed, cents, compact, className, tone = "none" }: MoneyProps) {
  const toneClass = tone === "auto" ? (minor > 0 ? "text-income" : minor < 0 ? "text-foreground" : "") : ""
  return <span className={cn("tabular whitespace-nowrap", toneClass, className)}>{formatMoney(minor, currency, { signed, cents, compact })}</span>
}

/** A headline amount that counts up from zero when it appears, and rolls to each new value after. */
export function AnimatedMoney({ minor, currency = "PHP", className, symbolClassName }: { minor: number; currency?: string; className?: string; symbolClassName?: string }) {
  const reduced = useMotionReduced()
  const [display, setDisplay] = useState(0)
  const previous = useRef(0)
  useEffect(() => {
    if (reduced) {
      previous.current = minor
      return
    }
    const from = previous.current
    const start = performance.now()
    // The first count, from zero, takes a little longer so it reads as the money arriving.
    const duration = from === 0 ? 900 : 650
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (minor - from) * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
      else previous.current = minor
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [minor, reduced])

  const shown = reduced ? minor : display
  const text = formatMoney(Math.round(shown / 100) * 100, currency)
  const symbol = currencySymbol(currency)
  const [sign, rest] = text.startsWith("−") ? ["−", text.slice(1)] : ["", text]
  return (
    <span className={cn("tabular font-money whitespace-nowrap", className)} aria-label={amountsHidden() ? "Amount hidden" : formatMoney(minor, currency)}>
      {sign}
      <span className={cn("mr-[0.06em] align-[0.36em] text-[0.58em] font-medium text-muted-foreground", symbolClassName)}>{symbol}</span>
      {rest.slice(symbol.length)}
    </span>
  )
}
