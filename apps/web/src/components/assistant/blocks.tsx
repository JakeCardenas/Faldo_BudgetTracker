"use client"

import { ArrowDownRight, ArrowUpRight, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react"
import { ForecastChart, IncomeExpenseBars } from "@/components/charts/charts"
import { CalculationCard, RiskBadge } from "@/components/finance/calculation-card"
import { ProgressBar, STATUS_LABEL } from "@/components/finance/progress-bar"
import { formatDate, formatMoney, formatPct } from "@/lib/format"
import type { Block } from "@/lib/types"
import { cn } from "@/lib/utils"

function Frame({ title, children, badge = true }: { title: string; children: React.ReactNode; badge?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
        <p className="truncate text-sm font-medium">{title}</p>
        {badge && <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[0.68rem] font-medium text-primary">From your data</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export function BlockView({ block, onOpenTransaction }: { block: Block; onOpenTransaction?: (id: string) => void }) {
  switch (block.type) {
    case "calculation":
      return <CalculationCard title={block.title} lines={block.lines} resultLabel={block.result_label} resultMinor={block.result_minor} note={block.note} />
    case "risk": {
      const Icon = block.level === "low" ? ShieldCheck : block.level === "medium" ? ShieldQuestion : ShieldAlert
      return (
        <div className={cn("space-y-2 rounded-2xl border p-4", block.level === "high" && "border-destructive/20 bg-danger-soft/50", block.level === "medium" && "border-warning/20 bg-warning-soft/50", block.level === "low" && "bg-mint/40")}>
          <div className="flex items-center gap-2"><Icon className="size-4" /><RiskBadge level={block.level} verdict={block.verdict} /></div>
          {block.reasons.length > 0 && <ul className="space-y-1 text-sm text-muted-foreground">{block.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>}
        </div>
      )
    }
    case "stats":
      return (
        <Frame title={block.title}>
          <dl className="grid gap-3 sm:grid-cols-3">
            {block.items.map((item) => (
              <div key={item.label} className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="tabular text-lg font-semibold tracking-tight">{item.amount_minor !== undefined ? formatMoney(item.amount_minor) : item.value}</dd>
                {item.hint && <dd className="text-xs text-muted-foreground">{item.hint}</dd>}
              </div>
            ))}
          </dl>
        </Frame>
      )
    case "breakdown":
      return (
        <Frame title={block.title}>
          <ul className="space-y-2.5">
            {block.rows.map((row) => (
              <li key={row.label} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm"><span className="truncate">{row.label}</span><span className="tabular font-medium">{formatMoney(row.amount_minor)} <span className="text-xs font-normal text-muted-foreground">{formatPct(row.pct)}</span></span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t pt-2 text-right text-sm">Total <span className="tabular font-semibold">{formatMoney(block.total_minor)}</span></p>
        </Frame>
      )
    case "transactions":
      return (
        <Frame title={`${block.title} · ${block.count}`}>
          <ul className="-my-1 divide-y">
            {block.items.slice(0, 8).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onOpenTransaction?.(t.id)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:text-primary">
                  <span className="rounded bg-muted px-1.5 font-mono text-[0.65rem] text-muted-foreground">{t.ref}</span>
                  <span className="min-w-0 flex-1 truncate">{t.merchant ?? t.category ?? "Transaction"} <span className="text-xs text-muted-foreground">· {formatDate(t.date, "MMM d")} · {t.account}</span></span>
                  <span className="tabular">{formatMoney(t.type === "expense" ? -t.amount_minor : t.amount_minor)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Frame>
      )
    case "progress":
      return (
        <Frame title={block.title}>
          <ul className="space-y-3">
            {block.items.map((item) => (
              <li key={item.label} className="space-y-1.5">
                <div className="flex justify-between gap-2 text-sm"><span className="truncate font-medium">{item.label}</span><span className="tabular text-muted-foreground">{formatMoney(item.current_minor)} / {formatMoney(item.target_minor)}</span></div>
                <ProgressBar value={item.pct} status={item.status} label={`${item.label} ${item.pct}%`} />
                <p className="text-xs text-muted-foreground">{STATUS_LABEL[item.status] ?? ""}{STATUS_LABEL[item.status] && " · "}{item.hint}</p>
              </li>
            ))}
          </ul>
        </Frame>
      )
    case "forecast":
      return <Frame title={`${block.title} (estimate)`}><ForecastChart series={block.series} actual={block.actual} baseline={block.baseline} bufferMinor={block.buffer_minor} height={200} /></Frame>
    case "comparison":
      return (
        <Frame title={block.title}>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-muted-foreground">{block.current_label}</p><p className="tabular text-lg font-semibold">{formatMoney(block.current_minor)}</p></div>
            <div><p className="text-xs text-muted-foreground">{block.previous_label}</p><p className="tabular text-lg font-semibold text-muted-foreground">{formatMoney(block.previous_minor)}</p></div>
          </div>
          <p className={cn("mt-2 text-sm font-medium", block.delta_minor > 0 ? "text-warning" : "text-primary")}>
            {formatMoney(block.delta_minor, "PHP", { signed: true })}{block.delta_pct !== null && ` (${formatPct(block.delta_pct, true)})`}
          </p>
          {block.drivers.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t pt-3">
              {block.drivers.slice(0, 5).map((d) => (
                <li key={d.label} className="flex items-center gap-2 text-sm">
                  {d.delta_minor > 0 ? <ArrowUpRight className="size-3.5 text-warning" /> : <ArrowDownRight className="size-3.5 text-primary" />}
                  <span className="flex-1 truncate">{d.label}</span>
                  <span className="tabular text-xs text-muted-foreground">{formatMoney(d.previous_minor)} → {formatMoney(d.current_minor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Frame>
      )
    case "list":
      return (
        <Frame title={block.title}>
          <ul className="-my-1 divide-y">
            {block.items.slice(0, 12).map((item, i) => (
              <li key={`${item.label}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate">{item.label}</span>{item.hint && <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>}</span>
                <span className={cn("tabular", item.amount_minor > 0 && block.title !== "Counted in this total" && block.title !== "Recurring payments" && "text-emerald")}>{formatMoney(item.amount_minor)}</span>
              </li>
            ))}
          </ul>
          {block.total_minor !== undefined && <p className="mt-2 border-t pt-2 text-right text-sm">{block.total_label ?? "Total"} <span className="tabular font-semibold">{formatMoney(block.total_minor)}</span></p>}
        </Frame>
      )
    case "bars":
      return <Frame title={block.title}><IncomeExpenseBars data={block.series} height={200} /></Frame>
    case "health":
      return (
        <Frame title="Financial health">
          {block.score === null ? <p className="text-sm text-muted-foreground">Not enough history yet ({block.history_days} days).</p> : (
            <div className="space-y-3">
              <p><span className="text-3xl font-semibold">{block.score}</span> <span className="text-sm text-muted-foreground">/ 100 · {block.label}</span></p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {block.components.filter((c) => c.counted).map((c) => (
                  <li key={c.key} className="text-sm"><div className="flex justify-between"><span>{c.label}</span><span className="tabular">{c.score}</span></div><ProgressBar value={c.score ?? 0} label={c.label} className="mt-1 h-1.5" /></li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{block.disclaimer}</p>
            </div>
          )}
        </Frame>
      )
    default:
      return null
  }
}
