"use client"

import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from "lucide-react"
import type { Insight, Severity } from "@/lib/types"
import { cn } from "@/lib/utils"

const STYLES: Record<Severity, { icon: typeof Info; tone: string; dot: string; label: string }> = {
  critical: { icon: OctagonAlert, tone: "bg-danger-soft text-destructive", dot: "bg-destructive", label: "Needs attention" },
  warning: { icon: AlertTriangle, tone: "bg-warning-soft text-warning", dot: "bg-warning", label: "Heads up" },
  info: { icon: Info, tone: "bg-secondary text-primary", dot: "bg-chart-5", label: "For you" },
  positive: { icon: CheckCircle2, tone: "bg-mint text-mint-foreground", dot: "bg-emerald", label: "Good news" },
}

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", STYLES[severity].dot, className)} aria-hidden />
}

export function InsightCard({ insight, onDismiss, compact }: { insight: Insight; onDismiss?: (id: string) => void; compact?: boolean }) {
  const style = STYLES[insight.severity]
  const Icon = style.icon
  return (
    <div className={cn("group relative flex gap-3", compact ? "py-3" : "card-surface p-4")}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", style.tone)}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5 pr-6">
        <p className="text-sm font-medium leading-snug">{insight.title}</p>
        <p className={cn("text-sm text-muted-foreground", compact && "line-clamp-2")}>{insight.body}</p>
        {!compact && <p className="pt-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground/80 uppercase">{style.label} · Based on your data</p>}
      </div>
      {onDismiss && (
        <button onClick={() => onDismiss(insight.id)} aria-label="Dismiss insight"
          className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground opacity-60 transition hover:bg-muted hover:opacity-100 focus-visible:opacity-100">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
