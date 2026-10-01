"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import { Money } from "@/shared/ui/money/money"
import { formatMoney } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"

/**
 * Spending per day for the last seven days on quiet tracks, today the bright bar. The week's total is written above
 * the bars, so nothing needs a tap; tapping (or pointing at, or focusing) a day swaps in that day's amount.
 */
export function WeekBars({ days }: { days: { date: string; amount_minor: number }[] }) {
  const [picked, setPicked] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.amount_minor))
  const total = days.reduce((sum, d) => sum + d.amount_minor, 0)
  const day = picked !== null ? days[picked] : null
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]" aria-live="polite">
        <span className="font-semibold">{day ? format(parseISO(day.date), "EEEE, MMM d") : "Last 7 days"}</span>
        <Money minor={day ? day.amount_minor : total} className="font-bold" />
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-2" onPointerLeave={(e) => { if (e.pointerType === "mouse") setPicked(null) }}>
        {days.map((d, i) => {
          const isToday = i === days.length - 1
          const on = picked === i || (picked === null && isToday)
          return (
            <li key={d.date} className="min-w-0">
              <button type="button" aria-label={`${format(parseISO(d.date), "EEEE, MMMM d")}: ${formatMoney(d.amount_minor)}`} aria-pressed={picked === i}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") setPicked(i) }}
                onClick={() => setPicked(picked === i ? null : i)} onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setPicked(i) }} onBlur={() => setPicked(null)}
                className="group flex w-full flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <span className="flex h-14 w-full items-end overflow-hidden rounded-[0.375rem] bg-chart-track">
                  <span className={cn("w-full rounded-[0.375rem] transition-[background-color] duration-200", on ? "bg-primary" : "bg-chart-2")}
                    style={{ height: d.amount_minor > 0 ? `max(0.25rem, ${(d.amount_minor / max) * 100}%)` : 0 }} />
                </span>
                <span className={cn("text-[0.6875rem] leading-none", isToday ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                  {format(parseISO(d.date), "EEEEE")}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
