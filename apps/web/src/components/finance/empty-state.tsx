import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function EmptyState({ icon: Icon, title, description, action, className, compact }: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-8" : "gap-3 py-14", className)}>
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-mint/60 blur-xl" aria-hidden />
        <div className="relative flex size-12 items-center justify-center rounded-2xl border bg-card text-primary shadow-(--shadow-card)">
          <Icon className="size-5" strokeWidth={1.8} />
        </div>
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground text-balance-safe">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}
