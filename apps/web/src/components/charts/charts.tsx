"use client"

import { format, parseISO } from "date-fns"
import { useId, useMemo } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { formatMoney } from "@/lib/format"
import type { CategoryRow, ForecastPoint } from "@/lib/types"

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" }

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-xl bg-popover px-3 py-2.5 text-xs shadow-(--shadow-float) ring-1 ring-foreground/[0.06]">
      <p className="mb-1.5 font-medium">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="size-2 rounded-[3px]" style={{ backgroundColor: r.color }} />}{r.label}
          </span>
          <span className="tabular font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

const compact = (v: number) => formatMoney(v, "PHP", { compact: true })

export interface BalancePointValue { date: string; value: number }

/**
 * Answers one question: how has my balance moved? A single line, no grid, a dot where today is.
 * `tone="light"` draws it in white for the green Home environment. `onHover` reports the point under
 * the finger or cursor so the headline can show that day's balance.
 */
export function BalanceLine({ data, height = 168, tone = "default", onHover }: {
  data: BalancePointValue[]
  /** Pixels, or "100%" to fill the parent. */
  height?: number | "100%"
  tone?: "default" | "light"
  onHover?: (point: BalancePointValue | null) => void
}) {
  const gradientId = `line-${useId().replace(/:/g, "")}`
  const min = Math.min(...data.map((d) => d.value))
  const max = Math.max(...data.map((d) => d.value))
  const pad = Math.max(1, (max - min) * 0.18)
  const stroke = tone === "light" ? "#ffffff" : "var(--primary)"
  const ring = tone === "light" ? "var(--hero-deep)" : "var(--card)"
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 10, left: 10, bottom: 4 }}
        onMouseMove={(state) => {
          const index = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : Number(state?.activeTooltipIndex)
          onHover?.(Number.isFinite(index) && data[index] ? data[index] : null)
        }}
        onMouseLeave={() => onHover?.(null)}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={tone === "light" ? 0.28 : 0.16} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[min - pad, max + pad]} />
        <XAxis dataKey="date" hide />
        <Tooltip cursor={{ stroke: tone === "light" ? "rgb(255 255 255 / 0.45)" : "var(--border)", strokeWidth: 1 }}
          content={onHover ? () => null : ({ payload }) => payload?.length ? (
            <TooltipCard title={format(parseISO(payload[0].payload.date), "EEE, MMM d")} rows={[{ label: "Balance", value: formatMoney(payload[0].payload.value) }]} />
          ) : null} />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={`url(#${gradientId})`} isAnimationActive animationDuration={600}
          dot={(props: { cx?: number; cy?: number; index?: number }) => props.index === data.length - 1 && props.cx !== undefined && props.cy !== undefined
            ? <g key="end"><circle cx={props.cx} cy={props.cy} r={10} fill={stroke} opacity={0.22} /><circle cx={props.cx} cy={props.cy} r={4.5} fill={stroke} stroke={ring} strokeWidth={2} /></g>
            : <g key={`d-${props.index}`} />}
          activeDot={{ r: 5, fill: stroke, stroke: ring, strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function SpendingDonut({ rows, total, label = "Spent" }: { rows: CategoryRow[]; total: number; label?: string }) {
  const top = rows.slice(0, 6)
  const rest = rows.slice(6).reduce((s, r) => s + r.amount_minor, 0)
  const data = rest > 0 ? [...top, { label: "Other", amount_minor: rest, pct: 0, color: "#c5cfc9", category_id: null, icon: "" }] : top
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[13rem]">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="amount_minor" nameKey="label" innerRadius="70%" outerRadius="100%" paddingAngle={1.5} stroke="none" isAnimationActive animationDuration={700}>
            {data.map((row) => <Cell key={row.label} fill={row.color} />)}
          </Pie>
          <Tooltip content={({ payload }) => payload?.[0] ? (
            <TooltipCard title={String(payload[0].name)} rows={[{ label: "Amount", value: formatMoney(Number(payload[0].value)) }]} />
          ) : null} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="tabular text-lg font-semibold tracking-tight">{formatMoney(total)}</span>
      </div>
    </div>
  )
}

export function IncomeExpenseBars({ data, height = 240 }: { data: { label: string; income_minor: number; expense_minor: number; partial?: boolean; is_partial?: boolean }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={4} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={compact} width={56} />
        <Tooltip cursor={{ fill: "var(--muted)", radius: 6 }} content={({ payload, label }) => payload?.length ? (
          <TooltipCard title={`${label}${payload[0].payload.partial || payload[0].payload.is_partial ? " (so far)" : ""}`} rows={[
            { label: "Income", value: formatMoney(payload[0].payload.income_minor), color: "var(--chart-2)" },
            { label: "Expenses", value: formatMoney(payload[0].payload.expense_minor), color: "var(--chart-1)" },
            { label: "Net", value: formatMoney(payload[0].payload.income_minor - payload[0].payload.expense_minor, "PHP", { signed: true }) },
          ]} />
        ) : null} />
        <Bar dataKey="income_minor" fill="var(--chart-3)" radius={[6, 6, 2, 2]} maxBarSize={18} />
        <Bar dataKey="expense_minor" fill="var(--chart-1)" radius={[6, 6, 2, 2]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DailyBars({ data, height = 180 }: { data: { date: string; amount_minor: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(d) => format(parseISO(d), "d")} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={compact} width={52} />
        <Tooltip cursor={{ fill: "var(--muted)", radius: 6 }} content={({ payload }) => payload?.length ? (
          <TooltipCard title={format(parseISO(payload[0].payload.date), "EEE, MMM d")} rows={[{ label: "Spent", value: formatMoney(payload[0].payload.amount_minor) }]} />
        ) : null} />
        <Bar dataKey="amount_minor" fill="var(--chart-2)" radius={[4, 4, 1, 1]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function mergeForecast(series: ForecastPoint[], actual: { date: string; balance_minor: number }[], baseline?: { date: string; p50: number }[]) {
  const byDate = new Map<string, Record<string, number | string | number[] | null>>()
  for (const point of actual) byDate.set(point.date, { date: point.date, actual: point.balance_minor })
  for (const point of series) {
    const row = byDate.get(point.date) ?? { date: point.date }
    Object.assign(row, { p50: point.p50, band: [point.p10, point.p90] })
    byDate.set(point.date, row)
  }
  for (const point of baseline ?? []) {
    const row = byDate.get(point.date) ?? { date: point.date }
    row.baseline = point.p50
    byDate.set(point.date, row)
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

const EMPTY_ACTUAL: { date: string; balance_minor: number }[] = []

export function ForecastChart({ series, actual = EMPTY_ACTUAL, baseline, bufferMinor, height = 280 }: {
  series: ForecastPoint[]
  actual?: { date: string; balance_minor: number }[]
  baseline?: { date: string; p50: number }[]
  bufferMinor?: number
  height?: number
}) {
  const data = useMemo(() => mergeForecast(series, actual, baseline), [series, actual, baseline])
  const gradientId = `band-${useId().replace(/:/g, "")}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 6, left: -6, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.06} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(d) => format(parseISO(d), "MMM d")} minTickGap={28} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={compact} width={58} />
        {bufferMinor ? <ReferenceLine y={bufferMinor} stroke="var(--warning)" strokeDasharray="4 4" strokeOpacity={0.6} /> : null}
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip content={({ payload, label }) => payload?.length ? (
          <TooltipCard title={format(parseISO(String(label)), "EEE, MMM d")} rows={[
            ...(payload[0].payload.actual !== undefined ? [{ label: "Actual", value: formatMoney(payload[0].payload.actual), color: "var(--chart-1)" }] : []),
            ...(payload[0].payload.p50 !== undefined ? [{ label: "Projected", value: formatMoney(payload[0].payload.p50), color: "var(--chart-2)" }] : []),
            ...(payload[0].payload.band ? [{ label: "Likely range", value: `${compact(payload[0].payload.band[0])} to ${compact(payload[0].payload.band[1])}` }] : []),
            ...(payload[0].payload.baseline !== undefined ? [{ label: "Without change", value: formatMoney(payload[0].payload.baseline), color: "var(--muted-foreground)" }] : []),
          ]} />
        ) : null} />
        <Area dataKey="band" stroke="none" fill={`url(#${gradientId})`} isAnimationActive={false} />
        {baseline && <Line dataKey="baseline" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
        <Line dataKey="actual" stroke="var(--chart-1)" strokeWidth={2.25} dot={false} connectNulls isAnimationActive={false} />
        <Line dataKey="p50" stroke="var(--chart-2)" strokeWidth={2.25} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
