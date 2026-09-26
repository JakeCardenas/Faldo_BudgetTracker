"use client"

import { format, parseISO } from "date-fns"
import { useId, useMemo, useState } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { formatMoney } from "@/lib/format"
import { PALETTE } from "@/lib/palette"
import { useAmountsHidden } from "@/lib/privacy"
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

/** Three or four round values that cover the data, so the scale reads ₱40K, ₱45K, ₱50K instead of odd numbers. */
function niceTicks(min: number, max: number) {
  const span = Math.max(max - min, Math.abs(max) * 0.04, 10_000)
  const magnitude = 10 ** Math.floor(Math.log10(span / 2))
  for (const m of [0.5, 1, 2, 2.5, 5, 10, 20]) {
    const step = m * magnitude
    const lo = Math.floor(min / step) * step
    const hi = Math.ceil(max / step) * step
    const count = Math.round((hi - lo) / step) + 1
    if (count <= 4) return Array.from({ length: count }, (_, i) => lo + i * step)
  }
  return [min, max]
}

const PLOT = { top: 10, right: 4, left: 2, bottom: 4, axis: 46 }

/**
 * Answers one question: how has my balance moved? One line over a quiet grid, a compact scale on the
 * right, the first, middle and last dates below and a dot for today. `startLine` adds a dashed line at
 * where the range began, so up or down reads at a glance. `tone="light"` draws it in white for the green
 * Home environment. Drag across it (finger or mouse) or use the arrow keys to read any day; `onHover`
 * reports that point so a headline can show it.
 */
export function BalanceLine({ data, height = 168, tone = "default", startLine = false, onHover }: {
  data: BalancePointValue[]
  /** Pixels, or "100%" to fill the parent. */
  height?: number | "100%"
  /** "light" draws it in white for the green Home environment. */
  tone?: "default" | "light"
  startLine?: boolean
  onHover?: (point: BalancePointValue | null) => void
}) {
  const gradientId = `line-${useId().replace(/:/g, "")}`
  const hidden = useAmountsHidden()
  const [active, setActive] = useState<number | null>(null)
  const ticks = useMemo(() => niceTicks(Math.min(...data.map((d) => d.value)), Math.max(...data.map((d) => d.value))), [data])
  const dates = useMemo(() => {
    const last = data.length - 1
    return [...new Set([0, Math.round(last / 2), last])].map((i) => data[i].date)
  }, [data])
  const today = format(new Date(), "yyyy-MM-dd")
  const axis = hidden ? 0 : PLOT.axis
  const point = active !== null ? data[active] : null
  const light = tone === "light"
  const stroke = light ? "#ffffff" : "var(--primary)"
  const ink = light ? "rgb(255 255 255 / 0.72)" : "var(--muted-foreground)"
  const ring = light ? "#1d5436" : "var(--card)"

  function pick(index: number | null) {
    setActive(index)
    onHover?.(index === null ? null : data[index])
  }
  function fromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const width = rect.width - PLOT.left - PLOT.right - axis
    const ratio = (event.clientX - rect.left - PLOT.left) / width
    pick(Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))))
  }

  return (
    <div tabIndex={0} role="group" className="relative h-full touch-pan-y rounded-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
      style={{ height }}
      aria-label={`Balance from ${format(parseISO(data[0].date), "MMM d")} to ${format(parseISO(data[data.length - 1].date), "MMM d")}. Use the arrow keys to read each day.`}
      onPointerDown={fromPointer} onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons) fromPointer(e) }}
      onPointerUp={(e) => { if (e.pointerType !== "mouse") pick(null) }}
      onPointerLeave={() => pick(null)} onPointerCancel={() => pick(null)} onBlur={() => pick(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault()
          const step = e.key === "ArrowLeft" ? -1 : 1
          pick(Math.min(data.length - 1, Math.max(0, (active ?? data.length - 1) + step)))
        } else if (e.key === "Escape") pick(null)
      }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: PLOT.top, right: PLOT.right, left: PLOT.left, bottom: PLOT.bottom }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={light ? 0.26 : 0.22} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={light ? "#ffffff" : "var(--foreground)"} strokeOpacity={light ? 0.16 : 0.07} />
          {startLine && <ReferenceLine y={data[0].value} stroke="var(--muted-foreground)" strokeOpacity={0.55} strokeDasharray="3 4" />}
          <YAxis orientation="right" hide={hidden} width={axis} domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} interval={0}
            axisLine={false} tickLine={false} tickMargin={6} tick={{ fontSize: 10.5, fill: ink }} tickFormatter={compact} />
          <XAxis dataKey="date" ticks={dates} interval={0} axisLine={false} tickLine={false} height={20} tickMargin={4}
            tick={({ x, y, payload }: { x: number | string; y: number | string; payload: { value: string } }) => (
              <text x={x} y={y} dy={9} fontSize={10.5} fill={ink}
                textAnchor={payload.value === dates[0] ? "start" : payload.value === dates[dates.length - 1] ? "end" : "middle"}>
                {payload.value === today ? "Today" : format(parseISO(payload.value), "MMM d")}
              </text>
            )} />
          {point && <ReferenceLine x={point.date} stroke={light ? "#ffffff" : "var(--foreground)"} strokeOpacity={light ? 0.5 : 0.22} strokeDasharray="3 3" />}
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive animationDuration={600}
            activeDot={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) => {
              if (props.cx === undefined || props.cy === undefined) return <g key={`d-${props.index}`} />
              if (props.index === active) return <g key="active"><circle cx={props.cx} cy={props.cy} r={5} fill={stroke} stroke={ring} strokeWidth={2.5} /></g>
              if (props.index === data.length - 1 && active === null) return <g key="end"><circle cx={props.cx} cy={props.cy} r={9} fill={stroke} opacity={light ? 0.24 : 0.16} /><circle cx={props.cx} cy={props.cy} r={4} fill={stroke} stroke={ring} strokeWidth={2} /></g>
              return <g key={`d-${props.index}`} />
            }} />
        </AreaChart>
      </ResponsiveContainer>
      {point && !onHover && (
        <div className="pointer-events-none absolute -top-1"
          style={{ left: `clamp(0px, calc(${PLOT.left}px + (100% - ${PLOT.left + PLOT.right + axis}px) * ${active! / Math.max(1, data.length - 1)} - 5rem), calc(100% - 10rem))` }}>
          <TooltipCard title={format(parseISO(point.date), "EEE, MMM d")} rows={[{ label: "Balance", value: formatMoney(point.value) }]} />
        </div>
      )}
    </div>
  )
}

export function SpendingDonut({ rows, total, label = "Spent" }: { rows: CategoryRow[]; total: number; label?: string }) {
  const top = rows.slice(0, 6)
  const rest = rows.slice(6).reduce((s, r) => s + r.amount_minor, 0)
  const data = rest > 0 ? [...top, { label: "Other", amount_minor: rest, pct: 0, color: PALETTE.stone, category_id: null, icon: "" }] : top
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[13rem]">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="amount_minor" nameKey="label" innerRadius="72%" outerRadius="100%" paddingAngle={2.5} cornerRadius={6} stroke="none" isAnimationActive animationDuration={700}>
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
  const hidden = useAmountsHidden()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={4} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis key={String(hidden)} tickLine={false} axisLine={false} tick={AXIS} tickFormatter={compact} width={56} />
        <Tooltip cursor={{ fill: "var(--muted)", radius: 6 }} content={({ payload, label }) => payload?.length ? (
          <TooltipCard title={`${label}${payload[0].payload.partial || payload[0].payload.is_partial ? " (so far)" : ""}`} rows={[
            { label: "Money in", value: formatMoney(payload[0].payload.income_minor), color: "var(--chart-1)" },
            { label: "Money out", value: formatMoney(payload[0].payload.expense_minor), color: "var(--chart-out)" },
            { label: "Net", value: formatMoney(payload[0].payload.income_minor - payload[0].payload.expense_minor, "PHP", { signed: true }) },
          ]} />
        ) : null} />
        <Bar dataKey="income_minor" fill="var(--chart-1)" radius={[6, 6, 2, 2]} maxBarSize={18} />
        <Bar dataKey="expense_minor" fill="var(--chart-out)" radius={[6, 6, 2, 2]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DailyBars({ data, height = 180 }: { data: { date: string; amount_minor: number }[]; height?: number }) {
  const hidden = useAmountsHidden()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(d) => format(parseISO(d), "d")} interval="preserveStartEnd" minTickGap={12} />
        <YAxis key={String(hidden)} tickLine={false} axisLine={false} tick={AXIS} tickFormatter={compact} width={52} />
        <Tooltip cursor={{ fill: "var(--muted)", radius: 6 }} content={({ payload }) => payload?.length ? (
          <TooltipCard title={format(parseISO(payload[0].payload.date), "EEE, MMM d")} rows={[{ label: "Spent", value: formatMoney(payload[0].payload.amount_minor) }]} />
        ) : null} />
        {/* Each day on a quiet track; the latest day is the bright one. */}
        <Bar dataKey="amount_minor" radius={[4, 4, 1, 1]} maxBarSize={14} background={{ fill: "var(--chart-track)", radius: 4 }}>
          {data.map((d, i) => <Cell key={d.date} fill={i === data.length - 1 ? "var(--primary)" : "var(--chart-2)"} />)}
        </Bar>
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
  // Keying the axis by "Hide amounts" redraws its labels when it changes; the same formatter alone wouldn't.
  const hidden = useAmountsHidden()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 6, left: -6, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.34} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.12} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(d) => format(parseISO(d), "MMM d")} minTickGap={28} />
        <YAxis key={String(hidden)} tickLine={false} axisLine={false} tick={AXIS} tickFormatter={compact} width={58} />
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
