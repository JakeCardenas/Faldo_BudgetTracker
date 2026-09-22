"use client"

import Link from "next/link"
import { Bell, CalendarClock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SeverityDot } from "@/components/finance/insight-card"
import { formatMoney, relativeDays } from "@/lib/format"
import { useInsights, useUpcoming } from "@/lib/queries"

/** What needs a look now: warnings and bills due within three days. Shared by the bell and the Faldo bubble. */
export function useNotifications() {
  const { data: insights = [] } = useInsights()
  const { data: upcoming = [] } = useUpcoming(7)
  const alerts = insights.filter((i) => i.severity === "warning" || i.severity === "critical").slice(0, 4)
  const bills = upcoming.filter((u) => !u.is_income && u.days_until_due <= 3).slice(0, 4)
  return { alerts, bills, count: alerts.length + bills.length }
}

/** `light` is the white bell inside the Home hero's button pill, on the green environment. */
export function Notifications({ tone = "default" }: { tone?: "default" | "light" }) {
  const { alerts, bills, count } = useNotifications()

  return (
    <Popover>
      <PopoverTrigger
        className={tone === "light"
          ? "relative flex size-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none aria-expanded:bg-white/15"
          : "relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none aria-expanded:bg-accent aria-expanded:text-foreground"}
        aria-label={count ? `Notifications, ${count} new` : "Notifications"}
      >
        <Bell className="size-[1.1rem]" strokeWidth={1.85} />
        {count > 0 && <span className={tone === "light" ? "absolute top-1.5 right-1.5 size-2 rounded-full bg-[#9be2ad] ring-2 ring-[#1f5436]" : "absolute top-2 right-2.5 size-1.5 rounded-full bg-primary ring-2 ring-background"} />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-2xl p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="text-xs text-muted-foreground">Alerts and bills due soon</p>
        </div>
        <div className="max-h-96 overflow-y-auto p-1.5">
          {count === 0 && <p className="px-3 py-10 text-center text-sm text-muted-foreground">You're all caught up.</p>}
          {bills.map((bill) => (
            <Link key={`${bill.recurring_payment_id}-${bill.due_on}`} href="/bills" className="flex gap-3 rounded-xl p-2.5 hover:bg-accent">
              <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex justify-between gap-3 text-sm font-medium"><span className="truncate">{bill.name}</span><span className="tabular">{formatMoney(bill.amount_minor)}</span></p>
                <p className="text-xs text-muted-foreground">{relativeDays(bill.days_until_due)}</p>
              </div>
            </Link>
          ))}
          {alerts.map((insight) => (
            <Link key={insight.id} href="/insights" className="flex gap-3 rounded-xl p-2.5 hover:bg-accent">
              <SeverityDot severity={insight.severity} className="mt-1.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{insight.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{insight.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
