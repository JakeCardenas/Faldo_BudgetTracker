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

/**
 * One insight as a row: its severity icon, the finding, what it's based on and an optional follow-up (like "Explain
 * this") on the same footer line. Rows sit together in one grouped surface; `compact` is the two-line version.
 */
export function InsightCard({ insight, onDismiss, compact, action }: { insight: Insight; onDismiss?: (id: string) => void; compact?: boolean; action?: React.ReactNode }) {
  const style = STYLES[insight.severity]
  const Icon = style.icon
  return (
    <div className={cn("group relative flex gap-3", compact ? "py-3" : "px-4 py-4")}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", style.tone)}>
        <Icon className="size-[1.05rem]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5 pr-7">
        <p className="text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em]">{insight.title}</p>
        <p className={cn("text-sm leading-relaxed text-muted-foreground", compact && "line-clamp-2")}>{insight.body}</p>
        {!compact && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1.5">
            <p className="text-xs text-muted-foreground">{style.label}, based on your data</p>
            {action}
          </div>
        )}
      </div>
      {onDismiss && (
        <button type="button" onClick={() => onDismiss(insight.id)} aria-label="Dismiss insight"
          className="hit absolute top-3.5 right-3 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
