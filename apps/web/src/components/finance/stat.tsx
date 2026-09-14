import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { formatPct } from "@/lib/format"
import { cn } from "@/lib/utils"

export function Delta({ pct, goodWhen = "up", suffix = "vs last period" }: { pct: number | null | undefined; goodWhen?: "up" | "down"; suffix?: string }) {
  if (pct === null || pct === undefined) return <span className="text-xs text-muted-foreground">No comparison yet</span>
  const up = pct > 0
  const good = pct === 0 ? null : (up ? goodWhen === "up" : goodWhen === "down")
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-medium", good === true && "bg-mint text-mint-foreground", good === false && "bg-warning-soft text-warning")}>
        {pct !== 0 && <Icon className="size-3" />}{formatPct(Math.abs(pct))}
      </span>
      {suffix}
    </span>
  )
}

export function StatCard({ label, value, footer, icon, className }: { label: string; value: React.ReactNode; footer?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card-surface flex flex-col gap-3 p-5", className)}>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>{icon}
      </div>
      <div className="text-[1.6rem] leading-none font-semibold tracking-tight">{value}</div>
      {footer && <div>{footer}</div>}
    </div>
  )
}
