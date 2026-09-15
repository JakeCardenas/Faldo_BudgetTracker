"use client"

import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from "lucide-react"
import type { Insight, Severity } from "@/lib/types"
import { cn } from "@/lib/utils"

const STYLES: Record<Severity, { icon: typeof Info; tone: string; dot: string; label: string }> = {
  critical: { icon: OctagonAlert, tone: "bg-danger-soft text-destructive", dot: "bg-destructive", label: "Needs attention" },
  warning: { icon: AlertTriangle, tone: "bg-warning-soft text-warning", dot: "bg-warning", label: "Heads up" },
  info: { icon: Info, tone: "bg-muted text-muted-foreground", dot: "bg-muted-foreground", label: "For you" },
  positive: { icon: CheckCircle2, tone: "bg-secondary text-primary", dot: "bg-primary", label: "Good news" },
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
        <Icon className="size-4" strokeWidth={1.85} />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5 pr-6">
        <p className="text-[0.9375rem] font-medium leading-snug">{insight.title}</p>
        <p className={cn("text-sm leading-relaxed text-muted-foreground", compact && "line-clamp-2")}>{insight.body}</p>
        {!compact && <p className="pt-1.5 text-xs text-muted-foreground">{style.label}, based on your data</p>}
      </div>
      {onDismiss && (
        <button onClick={() => onDismiss(insight.id)} aria-label="Dismiss insight"
          className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
