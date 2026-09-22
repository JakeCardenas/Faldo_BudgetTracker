"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Loader2, Plus, ReceiptText } from "lucide-react"
import { toast } from "sonner"
import { savePlanned } from "@/components/decide/planned"
import { useAppActions } from "@/components/layout/app-context"
import { ApiError } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { invalidateFinancialData } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Block } from "@/lib/types"
import { cn } from "@/lib/utils"

type Ideas = Extract<Block, { type: "ideas" }>
type Idea = Ideas["items"][number]

function range(idea: Idea) {
  return idea.low_minor === idea.high_minor ? formatMoney(idea.low_minor) : `${formatMoney(idea.low_minor)}–${formatMoney(idea.high_minor)}`
}

const pill = "pressable inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium transition-colors disabled:opacity-60"

/**
 * Faldo's suggestions, each with a rough price. Nothing is saved until you choose: Plan it keeps the idea as a
 * planned purchase, Log it opens the expense form (after you buy) with the name and category filled in.
 */
export function IdeasCard({ block }: { block: Ideas }) {
  const qc = useQueryClient()
  const router = useRouter()
  const { openAddTransaction } = useAppActions()
  const [planned, setPlanned] = useState<Record<string, "saving" | "done">>({})

  async function plan(idea: Idea) {
    setPlanned((p) => ({ ...p, [idea.name]: "saving" }))
    const amount = block.budget_minor ? Math.min(idea.high_minor, block.budget_minor) : idea.high_minor
    try {
      await savePlanned({ name: idea.name, amount_minor: amount, category_id: idea.category_id })
      await invalidateFinancialData(qc)
      play("success")
      setPlanned((p) => ({ ...p, [idea.name]: "done" }))
      toast.success(`${idea.name} added to planned purchases`, { action: { label: "View", onClick: () => router.push("/plan/purchases") } })
    } catch (error) {
      setPlanned((p) => { const next = { ...p }; delete next[idea.name]; return next })
      toast.error(error instanceof ApiError ? error.message : "Couldn't save that.")
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <p className="truncate text-sm font-medium">{block.title}</p>
        {block.budget_minor ? <span className="tabular shrink-0 text-xs text-muted-foreground">Budget {formatMoney(block.budget_minor)}</span> : null}
      </div>
      <ul className="divide-y divide-border/70">
        {block.items.map((idea) => {
          const state = planned[idea.name]
          const over = block.budget_minor !== null && idea.high_minor > block.budget_minor
          return (
            <li key={idea.name} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{idea.name}</p>
                  <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">{idea.why}</p>
                </div>
                <p className={cn("tabular shrink-0 text-right text-sm font-semibold", over && "text-warning")}>{range(idea)}</p>
              </div>
              <div className="mt-2.5 flex gap-2">
                <button type="button" disabled={Boolean(state)} onClick={() => plan(idea)}
                  className={cn(pill, state === "done" ? "bg-secondary text-primary" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
                  {state === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : state === "done" ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                  {state === "done" ? "Planned" : "Plan it"}
                </button>
                <button type="button" onClick={() => { play("tap"); openAddTransaction({ mode: "expense", preset: { note: idea.name, category_id: idea.category_id } }) }}
                  className={cn(pill, "bg-muted text-foreground hover:bg-accent")}>
                  <ReceiptText className="size-3.5" /> Log it
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        {block.note} Planned ideas live in <Link href="/plan/purchases" className="font-medium text-primary">Planned purchases</Link>.
      </p>
    </div>
  )
}
