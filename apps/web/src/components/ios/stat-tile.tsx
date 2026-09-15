import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function StatTile({ icon: Icon, label, value, tone = "default", footer, className }: {
  icon?: LucideIcon
  label: string
  value: React.ReactNode
  tone?: "default" | "expense" | "income" | "neutral"
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("card-surface flex flex-col gap-2 p-4 sm:p-5", className)}>
      {Icon && (
        <span className={cn("flex size-9 items-center justify-center rounded-xl",
          tone === "expense" && "bg-expense-soft text-expense", tone === "income" && "bg-income-soft text-income",
          tone === "neutral" && "bg-muted text-muted-foreground", tone === "default" && "bg-secondary text-primary")}>
          <Icon className="size-[1.1rem]" strokeWidth={2.2} />
        </span>
      )}
      <p className="eyebrow mt-1">{label}</p>
      <div className="tabular text-[1.35rem] leading-none font-extrabold tracking-tight sm:text-2xl">{value}</div>
      {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
    </div>
  )
}

export function CardTitle({ title, subtitle, action, icon: Icon }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary"><Icon className="size-5" /></span>}
        <div className="min-w-0">
          <h2 className="text-base font-extrabold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
