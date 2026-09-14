import { cn } from "@/lib/utils"

const TONES: Record<string, string> = {
  on_track: "bg-primary",
  near_limit: "bg-[#c68a2b]",
  at_risk: "bg-warning",
  at_limit: "bg-warning",
  over: "bg-destructive",
  behind: "bg-warning",
  no_date: "bg-chart-2",
}

export function ProgressBar({ value, status = "on_track", marker, className, label }: {
  value: number
  status?: string
  marker?: number
  className?: string
  label: string
}) {
  const width = Math.max(0, Math.min(100, value))
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar"
      aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", TONES[status] ?? TONES.on_track)} style={{ width: `${width}%` }} />
      {marker !== undefined && marker > 0 && marker < 100 && (
        <span className="absolute top-0 h-full w-0.5 bg-foreground/25" style={{ left: `${marker}%` }} aria-hidden />
      )}
    </div>
  )
}

export const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  near_limit: "Near limit",
  at_risk: "At risk",
  at_limit: "At limit",
  over: "Over budget",
}
