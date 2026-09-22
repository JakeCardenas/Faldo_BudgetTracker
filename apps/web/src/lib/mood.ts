import type { FaldoMood } from "@/components/brand/faldo"
import type { Block, ToolCallRecord } from "@/lib/types"

type Progress = Extract<Block, { type: "progress" }>
type Stats = Extract<Block, { type: "stats" }>

/** Budgets: cash in hand with plenty left, the warning sign when one runs low, surprised when one goes over. */
function budgetMood(block: Progress): FaldoMood {
  if (block.items.some((i) => i.status === "over" || i.status === "at_limit")) return "surprised"
  if (block.items.some((i) => i.status === "at_risk" || i.status === "near_limit")) return "warning"
  return "money"
}

/** Goals: celebrating one that's reached, headband on when one is behind, flag up when they're on track. */
function goalMood(block: Progress): FaldoMood {
  if (block.items.some((i) => i.pct >= 100)) return "celebrate"
  if (block.items.some((i) => i.status === "behind")) return "motivated"
  return "goal"
}

/** Balances: worried when nothing is safe to spend, wallet in hand otherwise. */
function balanceMood(block: Stats): FaldoMood {
  const safe = block.items.find((i) => i.label === "Safe to spend")
  return safe?.amount_minor !== undefined && safe.amount_minor <= 0 ? "warning" : "wallet"
}

const TOOL_MOODS: Record<string, FaldoMood> = {
  plan_future_purchase: "shopping",
  get_goal_progress: "goal",
  get_savings_summary: "money",
  get_monthly_income: "money",
  get_current_balance: "wallet",
  get_money_plan: "wallet",
  get_budget_status: "chart",
  get_monthly_expenses: "chart",
  get_category_spending: "chart",
  compare_spending: "chart",
  calculate_forecast: "chart",
  simulate_scenario: "chart",
  get_upcoming_payments: "receipt",
  get_recurring_payments: "receipt",
  get_transactions: "receipt",
  sum_transactions: "receipt",
  get_debts: "receipt",
  get_insights: "idea",
  get_financial_health: "idea",
  calculate: "thinking",
  search_financial_memory: "thinking",
}

/**
 * Faldo's face on a chat reply: thinking while he works it out, then reacting to what the answer found.
 * The same question can land differently: plenty of budget left gets the cash, a budget running low gets
 * the warning sign, one that's over gets a surprised look.
 */
export function replyMood({ streaming, hasText, error, logged, tools, blocks }: {
  streaming?: boolean
  hasText: boolean
  error?: boolean
  logged?: boolean
  tools: string[]
  blocks: Block[]
}): FaldoMood {
  if (error) return "surprised"
  if (streaming && !hasText) return "thinking"
  if (logged) return "receipt"

  const risk = blocks.find((b) => b.type === "risk")
  if (risk?.type === "risk") {
    if (risk.level === "high") return "surprised"
    if (risk.level === "medium") return "warning"
    if (tools.includes("calculate_affordability")) return "money"
  }
  for (const block of blocks) {
    if (block.type === "progress" && block.title.startsWith("Budgets")) return budgetMood(block)
    if (block.type === "progress" && block.title.startsWith("Savings goals")) return goalMood(block)
    if (block.type === "stats" && block.title === "Balances") return balanceMood(block)
  }
  for (const name of [...tools].reverse()) if (TOOL_MOODS[name]) return TOOL_MOODS[name]
  return "happy"
}

/** The tools that answered a reply, from the saved record or the live steps. */
export function toolNames(records: ToolCallRecord[] | undefined, steps?: { tool: string; state: string }[]) {
  return [...(records ?? []).filter((r) => r.ok).map((r) => r.name), ...(steps ?? []).filter((s) => s.state !== "error").map((s) => s.tool)]
}
