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
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2.5 px-4 py-8" : "gap-3 px-6 py-14", className)}>
      <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground">{title}</p>
        {description && <p className="text-sm leading-relaxed text-muted-foreground text-balance-safe">{description}</p>}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  )
}
