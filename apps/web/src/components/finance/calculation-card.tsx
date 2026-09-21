import { Calculator } from "lucide-react"
import { formatDate, formatMoney } from "@/lib/format"
import type { CalcLine } from "@/lib/types"
import { cn } from "@/lib/utils"

export function CalculationCard({ title, lines, resultLabel, resultMinor, note, className }: {
  title: string
  lines: CalcLine[]
  resultLabel: string
  resultMinor: number
  note?: string
  className?: string
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <p className="text-sm font-medium">{title}</p>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Calculator className="size-3" /> Calculated by Faldo</span>
      </div>
      <dl className="divide-y divide-border/60 px-4">
        {lines.map((line, index) => (
          <div key={`${line.label}-${index}`} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="tabular font-medium">
                <span className="mr-1 text-muted-foreground">{line.op === "add" ? "+" : line.op === "subtract" ? "−" : ""}</span>
                {formatMoney(line.amount_minor)}
              </dd>
            </div>
            {line.hint && <p className="mt-0.5 text-xs text-muted-foreground/80">{line.hint}</p>}
            {line.items && line.items.length > 0 && (
              <ul className="mt-1 space-y-0.5 border-l pl-3">
                {line.items.map((item) => (
                  <li key={`${item.ref_id}-${item.date}-${item.label}`} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{item.label} · <span className={cn(item.is_overdue && "font-medium text-expense")}>{item.is_overdue ? "overdue" : formatDate(item.date, "MMM d")}</span></span>
                    <span className="tabular">{formatMoney(item.amount_minor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3">
        <span className="text-sm font-medium">{resultLabel}</span>
        <span className={cn("tabular text-lg font-semibold tracking-[-0.01em]", resultMinor < 0 && "text-destructive")}>{formatMoney(resultMinor)}</span>
      </div>
      {note && <p className="px-4 py-2.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

export function RiskBadge({ level, verdict }: { level: "low" | "medium" | "high"; verdict: string }) {
  const map = {
    low: { cls: "bg-secondary text-secondary-foreground", text: "Low risk" },
    medium: { cls: "bg-warning-soft text-warning", text: "Moderate risk" },
    high: { cls: "bg-danger-soft text-destructive", text: "High risk" },
  }[level]
  const verdictText = { comfortable: "Comfortable", tight: "Tight", not_recommended: "Not recommended" }[verdict] ?? verdict
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium", map.cls)}>{map.text}, {verdictText.toLowerCase()}</span>
}
