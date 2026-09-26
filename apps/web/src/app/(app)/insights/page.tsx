"use client"

import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Lightbulb, RefreshCw, Sparkles } from "lucide-react"
import { EmptyState } from "@/components/finance/empty-state"
import { InsightCard } from "@/components/finance/insight-card"
import { HeaderButton } from "@/components/ios/nav-header"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { useMaskedAmounts } from "@/lib/privacy"
import { useInsights, usePulse } from "@/lib/queries"
import type { Insight } from "@/lib/types"
import { cn } from "@/lib/utils"

const QUESTIONS: Record<string, (i: Insight) => string> = {
  budget_exceeded: (i) => `Why is my ${i.facts.category} budget over this month?`,
  budget_risk: (i) => `How can I keep ${i.facts.category} within budget this month?`,
  spending_increase: (i) => `Why did my ${i.facts.category} spending go up?`,
  spending_increase_total: () => "Have I been spending more than last month?",
  cash_flow_warning: () => "Why am I running out of money?",
  goal_behind: (i) => `When can I afford my ${i.facts.goal}?`,
  unusual_transaction: (i) => `Tell me about my ${i.facts.merchant} purchase`,
}

export default function InsightsPage() {
  useMaskedAmounts()
  const qc = useQueryClient()
  const { data: insights, isLoading, isFetching, refetch } = useInsights()
  const { data: pulse } = usePulse()

  // A dismissed insight folds away (200ms) before it leaves the list, so the rows below don't jump.
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  async function dismiss(id: string) {
    setLeaving((s) => new Set(s).add(id))
    window.setTimeout(() => qc.setQueryData<Insight[]>(["insights"], (old) => old?.filter((i) => i.id !== id)), 200)
    await api.post(`/insights/${id}/dismiss`)
  }

  const groups = [
    { title: "Needs attention", items: insights?.filter((i) => i.severity === "critical" || i.severity === "warning") ?? [] },
    { title: "Worth knowing", items: insights?.filter((i) => i.severity === "info") ?? [] },
    { title: "Going well", items: insights?.filter((i) => i.severity === "positive") ?? [] },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Insights" description="Patterns Faldo detected in your actual data. Every insight is backed by specific numbers."
        actions={<HeaderButton onClick={() => refetch()} disabled={isFetching} aria-label="Refresh"><RefreshCw className={isFetching ? "animate-spin" : ""} /><span className="max-lg:sr-only">Refresh</span></HeaderButton>} />
      {pulse && (
        <div className="card-surface p-5">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">Financial pulse</p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed">{pulse.text}</p>
        </div>
      )}
      {isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div> : !insights?.length ? (
        <div className="card-surface"><EmptyState icon={Lightbulb} title="No insights right now" description="Insights appear when Faldo spots budget risks, unusual purchases, upcoming bills or progress worth celebrating." /></div>
      ) : (
        groups.filter((g) => g.items.length).map((group) => (
          <section key={group.title} className="space-y-3">
            <h2 className="section-title">{group.title}</h2>
            <ul className="ios-group divide-y divide-border/60">
              {group.items.map((insight) => (
                <li key={insight.id} className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-(--ease-out-quint)",
                  leaving.has(insight.id) ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]")}>
                  <div className="min-h-0 overflow-hidden">
                  <InsightCard insight={insight} onDismiss={dismiss} action={QUESTIONS[insight.type] && (
                    <Link href={`/assistant?q=${encodeURIComponent(QUESTIONS[insight.type](insight))}`}
                      className="hit inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80">
                      <Sparkles className="size-3" /> Explain this
                    </Link>
                  )} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
