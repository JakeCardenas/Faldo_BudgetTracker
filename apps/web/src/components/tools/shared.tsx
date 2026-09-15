import { cn } from "@/lib/utils"

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-[0.8125rem] font-medium text-foreground/80">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export const inputClass = "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus:border-ring focus:ring-3 focus:ring-ring/25 sm:text-sm"

export function ResultRow({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: "income" | "expense" }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-2", strong && "border-t pt-3")}>
      <span className={cn("text-sm", strong ? "font-medium" : "text-muted-foreground")}>{label}</span>
      <span className={cn("tabular text-right", strong ? "text-lg font-semibold tracking-[-0.01em]" : "font-medium", tone === "income" && "text-income", tone === "expense" && "text-expense")}>{value}</span>
    </div>
  )
}

export function Disclaimer({ children }: { children: React.ReactNode }) {
  return <p className="mx-auto max-w-2xl px-2 text-center text-xs leading-relaxed text-muted-foreground">{children}</p>
}
