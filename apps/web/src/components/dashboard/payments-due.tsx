import Link from "next/link"
import { CalendarCheck } from "lucide-react"
import { formatDate, formatMoney } from "@/lib/format"
import type { UpcomingItem } from "@/lib/types"
import { cn } from "@/lib/utils"

function dueLabel(item: UpcomingItem) {
  if (item.is_overdue) return `${Math.abs(item.days_until_due)} day${Math.abs(item.days_until_due) === 1 ? "" : "s"} overdue`
  if (item.days_until_due === 0) return "Due today"
  if (item.days_until_due === 1) return "Tomorrow"
  return `${item.days_until_due} days left`
}

export function PaymentsDue({ items }: { items: UpcomingItem[] }) {
  const bills = items.filter((i) => !i.is_income)
  const totalDue = bills.reduce((sum, i) => sum + i.amount_minor, 0)
  const shown = items.slice(0, 6)

  return (
    <section className="card-surface flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[0.95rem] font-bold tracking-tight">Payments due</h2>
          <p className="text-xs text-muted-foreground">{bills.length} payment{bills.length === 1 ? "" : "s"} coming up</p>
        </div>
        <div className="text-right">
          <p className="tabular text-base font-extrabold tracking-tight">{formatMoney(totalDue)}</p>
          <p className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Total due</p>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary"><CalendarCheck className="size-5" /></span>
          <p className="text-sm font-semibold">Nothing due soon</p>
          <Link href="/bills" className="text-xs font-semibold text-primary hover:underline">Add rent, bills or subscriptions</Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {shown.map((item) => (
            <li key={`${item.recurring_payment_id}-${item.due_on}`}>
              <Link href="/bills" className="flex items-center gap-3 rounded-2xl border bg-surface p-2.5 pr-3.5 transition-colors hover:border-primary/25 hover:bg-secondary/60">
                <span className={cn("flex w-12 shrink-0 flex-col items-center rounded-xl bg-card py-1.5 shadow-(--shadow-card)", item.is_overdue && "bg-danger-soft")}>
                  <span className={cn("text-[0.6rem] font-bold tracking-wide text-muted-foreground uppercase", item.is_overdue && "text-destructive")}>{formatDate(item.due_on, "MMM")}</span>
                  <span className="text-lg leading-none font-extrabold">{formatDate(item.due_on, "d")}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[0.7rem] font-medium text-muted-foreground", item.is_overdue && "text-destructive", item.days_until_due <= 2 && !item.is_overdue && !item.is_income && "text-warning")}>
                    {dueLabel(item)}
                  </span>
                  <span className="block truncate text-sm font-bold">{item.name}</span>
                </span>
                <span className="text-right">
                  <span className={cn("tabular block text-sm font-extrabold", item.is_income && "text-emerald")}>
                    {item.is_income ? formatMoney(item.amount_minor, "PHP", { signed: true }) : formatMoney(item.amount_minor)}
                  </span>
                  <span className="block text-[0.6rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{item.is_income ? "Incoming" : "Due"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
