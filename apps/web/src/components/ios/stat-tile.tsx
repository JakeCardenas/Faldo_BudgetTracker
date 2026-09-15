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
    <div className={cn("card-surface flex flex-col gap-1.5 p-4", className)}>
      <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
        {Icon && <Icon className={cn("size-3.5", tone === "expense" && "text-expense", tone === "income" && "text-income")} strokeWidth={2} />}
        {label}
      </p>
      <div className="tabular text-[1.375rem] leading-tight font-semibold tracking-[-0.02em]">{value}</div>
      {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
    </div>
  )
}

export function CardTitle({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="text-[0.8125rem] text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
