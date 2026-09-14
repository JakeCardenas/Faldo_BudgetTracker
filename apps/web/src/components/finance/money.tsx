"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { currencySymbol, formatMoney } from "@/lib/format"
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
  const toneClass = tone === "auto" ? (minor > 0 ? "text-emerald" : minor < 0 ? "text-foreground" : "") : ""
  return <span className={cn("tabular whitespace-nowrap", toneClass, className)}>{formatMoney(minor, currency, { signed, cents, compact })}</span>
}

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  )
}

export function AnimatedMoney({ minor, currency = "PHP", className, symbolClassName }: { minor: number; currency?: string; className?: string; symbolClassName?: string }) {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(minor)
  const previous = useRef(minor)
  useEffect(() => {
    if (reduced) {
      previous.current = minor
      return
    }
    const from = previous.current
    const start = performance.now()
    const duration = 650
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
    <span className={cn("tabular whitespace-nowrap", className)} aria-label={formatMoney(minor, currency)}>
      {sign}
      <span className={cn("mr-0.5 align-top text-[0.62em] font-medium text-muted-foreground", symbolClassName)}>{symbol}</span>
      {rest.slice(symbol.length)}
    </span>
  )
}
