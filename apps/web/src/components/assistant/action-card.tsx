"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { invalidateFinancialData } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Block } from "@/lib/types"
import { cn } from "@/lib/utils"

type Action = Extract<Block, { type: "action" }>

/** Only these can be confirmed from a chat card, whatever the answer asks for. */
const ALLOWED = [/^\/goals$/, /^\/budgets$/, /^\/transactions$/, /^\/planned-purchases$/, /^\/notes$/, /^\/challenges$/,
  /^\/recurring\/[0-9a-f-]{36}\/pay$/]
const DONE_KEY = "faldo:actions-done"

function alreadyDone(id: string) {
  try {
    return (JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[]).includes(id)
  } catch {
    return false
  }
}

function markDone(id: string) {
  try {
    const list = JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[]
    localStorage.setItem(DONE_KEY, JSON.stringify([...list.slice(-40), id]))
  } catch {
    // Private browsing: the card just forgets after a reload.
  }
}

/**
 * Faldo offering to do something: the card spells out exactly what happens, and only your tap makes it happen.
 * It calls the same endpoints the app's own screens use, so everything is validated the usual way.
 */
export function ActionCard({ block }: { block: Action }) {
  const qc = useQueryClient()
  const [state, setState] = useState<"idle" | "working" | "done" | "skipped">(() => (alreadyDone(block.id) ? "done" : "idle"))
  const safe = ALLOWED.some((allowed) => allowed.test(block.request.path))

  async function confirm() {
    if (!safe) return
    setState("working")
    try {
      const { method, path, body } = block.request
      if (method === "PUT") await api.put(path, body)
      else if (method === "PATCH") await api.patch(path, body)
      else await api.post(path, body)
      await invalidateFinancialData(qc)
      play("success")
      markDone(block.id)
      setState("done")
    } catch (error) {
      setState("idle")
      toast.error(error instanceof ApiError ? error.message : "Couldn't do that.")
    }
  }

  if (!safe) return null
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", state === "done" && "opacity-80")}>
      <div className="border-b px-4 py-2.5">
        <p className="truncate text-sm font-medium">{block.title}</p>
      </div>
      <dl className="divide-y divide-border/70">
        {block.lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="text-[0.8125rem] text-muted-foreground">{line.label}</dt>
            <dd className={cn("min-w-0 text-right text-[0.9375rem] font-semibold", line.amount_minor !== undefined && "tabular")}>
              {line.amount_minor !== undefined ? formatMoney(line.amount_minor) : line.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2 border-t px-4 py-3">
        {state === "done" ? (
          <p className="flex items-center gap-1.5 text-[0.875rem] font-medium text-primary"><Check className="size-4" /> {block.done}</p>
        ) : state === "skipped" ? (
          <p className="text-[0.875rem] text-muted-foreground">Left as is.</p>
        ) : (
          <>
            <button type="button" disabled={state === "working"} onClick={confirm}
              className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.875rem] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {state === "working" && <Loader2 className="size-3.5 animate-spin" />} {block.confirm}
            </button>
            <button type="button" onClick={() => setState("skipped")}
              className="pressable inline-flex h-9 items-center rounded-full px-3 text-[0.875rem] text-muted-foreground hover:bg-accent hover:text-foreground">
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  )
}
