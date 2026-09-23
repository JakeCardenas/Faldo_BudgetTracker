export type TransactionType = "income" | "expense" | "transfer" | "debt_in" | "debt_out"
export type AccountType = "cash" | "bank" | "e_wallet" | "credit_card" | "savings" | "custom"
export type Frequency = "weekly" | "biweekly" | "semi_monthly" | "monthly" | "quarterly" | "yearly" | "once"
export type RecurringKind = "bill" | "subscription" | "rent" | "loan" | "insurance" | "income" | "other"
export type Severity = "positive" | "info" | "warning" | "critical"

export interface Settings {
  currency: string
  timezone: string
  pay_frequency: Frequency | null
  pay_days: number[]
  monthly_income_minor: number | null
  safe_to_spend_buffer_minor: number
  default_account_id: string | null
  onboarding_completed_at: string | null
  theme: "system" | "light" | "dark"
  mascot_outfit: string
  quick_actions: string[]
  completed_lessons: string[]
}

export interface Me {
  id: string
  email: string
  display_name: string
  settings: Settings
  ai_provider: string
}

export interface Account {
  id: string
  name: string
  type: AccountType
  custom_type: string | null
  institution: string | null
  currency: string
  opening_balance_minor: number
  balance_minor: number
  is_spendable: boolean
  credit_limit_minor: number | null
  card_last4: string | null
  color: string | null
  archived: boolean
  sort_order: number
  transaction_count: number
  last_activity_on: string | null
  updated_at: string
}

export interface Category {
  id: string
  name: string
  kind: "expense" | "income"
  parent_id: string | null
  icon: string | null
  color: string | null
  is_essential: boolean
}

export interface TransactionItem {
  id: string
  name: string
  quantity: string
  unit_amount_minor: number | null
  amount_minor: number
}

export interface Transaction {
  id: string
  type: TransactionType
  amount_minor: number
  currency: string
  occurred_on: string
  account_id: string
  account_name: string
  to_account_id: string | null
  to_account_name: string | null
  merchant: string | null
  category_id: string | null
  category_name: string | null
  category_color: string | null
  category_icon: string | null
  subcategory_id: string | null
  subcategory_name: string | null
  payment_method: string | null
  notes: string | null
  tags: string[]
  items: TransactionItem[]
  source: string
  recurring_payment_id: string | null
  debt_id: string | null
  created_at: string
  updated_at: string
}

export interface TransactionList {
  items: Transaction[]
  next_cursor: string | null
  total_count: number
  total_income_minor: number
  total_expense_minor: number
}

export interface TransactionInput {
  type: TransactionType
  amount_minor: number
  occurred_on: string
  account_id: string
  to_account_id?: string | null
  merchant?: string | null
  category_id?: string | null
  subcategory_id?: string | null
  payment_method?: string | null
  notes?: string | null
  tags?: string[]
  items?: { name: string; quantity?: number; amount_minor: number }[]
  recurring_payment_id?: string | null
}

export interface BudgetLine {
  id: string
  category_id: string
  category_name: string
  category_color: string | null
  category_icon: string | null
  limit_minor: number
  spent_minor: number
  remaining_minor: number
  pct_used: number
  pct_month_elapsed: number
  projected_minor: number
  status: "on_track" | "near_limit" | "at_risk" | "at_limit" | "over"
  previous_spent_minor: number
  average_spent_minor: number
}

export interface Budget {
  id: string | null
  month: string
  total_limit_minor: number | null
  total_budgeted_minor: number
  total_spent_minor: number
  total_spent_all_minor: number
  unbudgeted_spent_minor: number
  lines: BudgetLine[]
  history: { month: string; label: string; budgeted_minor: number; spent_minor: number; total_spent_minor: number }[]
}

export interface Contribution {
  id: string
  amount_minor: number
  occurred_on: string
  note: string | null
  transaction_id: string | null
}

export interface Goal {
  id: string
  name: string
  emoji: string | null
  target_minor: number
  saved_minor: number
  remaining_minor: number
  pct_complete: number
  target_date: string | null
  monthly_contribution_minor: number | null
  average_monthly_minor: number
  required_monthly_minor: number | null
  months_remaining: number | null
  projected_completion_on: string | null
  on_track: boolean | null
  status_reason: string
  linked_account_id: string | null
  linked_account_name: string | null
  status: "active" | "paused" | "completed" | "archived"
  notes: string | null
  contributions?: Contribution[]
  created_at: string
}

export interface Recurring {
  id: string
  name: string
  kind: RecurringKind
  amount_minor: number
  monthly_equivalent_minor: number
  is_amount_variable: boolean
  frequency: Frequency
  interval_count: number
  next_due_on: string
  days_until_due: number
  end_on: string | null
  account_id: string | null
  account_name: string | null
  category_id: string | null
  category_name: string | null
  merchant: string | null
  is_active: boolean
  notes: string | null
}

export interface UpcomingItem {
  recurring_payment_id: string
  name: string
  kind: RecurringKind
  amount_minor: number
  due_on: string
  days_until_due: number
  is_overdue: boolean
  is_income: boolean
  is_one_time: boolean
  category_id: string | null
  account_id: string | null
}

export interface Debt {
  id: string
  direction: "i_owe" | "owed_to_me"
  counterparty: string
  amount_minor: number
  paid_minor: number
  outstanding_minor: number
  due_on: string | null
  is_overdue: boolean
  status: "open" | "settled" | "cancelled"
  notes: string | null
  started_on: string
  payments: { id: string; amount_minor: number; paid_on: string; note: string | null; transaction_id: string | null; account_name: string | null }[]
  account_name: string | null
  source_transaction_id: string | null
}

export interface Insight {
  id: string
  type: string
  severity: Severity
  title: string
  body: string
  facts: Record<string, unknown>
  evidence: string[]
  status: string
  period: string
  created_at: string
}

export interface CategoryRow {
  label: string
  amount_minor: number
  pct: number
  category_id: string | null
  color: string
  icon: string
}

export interface CalcLineItem {
  label: string
  amount_minor: number
  date: string
  is_overdue: boolean
  kind: string
  ref_id: string | null
}

export interface CalcLine {
  key?: string
  label: string
  amount_minor: number
  op: "start" | "add" | "subtract"
  hint?: string
  items?: CalcLineItem[]
  repeat?: "once" | "daily" | "weekly" | "monthly"
  times?: number
  each_minor?: number
}

export interface SafeToSpend {
  amount_minor: number
  raw_minor: number
  per_day_minor: number
  days_left: number
  until: string
  period: "until_income" | "rolling"
  next_income_on: string | null
  next_income_label: string | null
  status: "good" | "tight" | "short"
  lines: CalcLine[]
  commitments_minor: number
  buffer_minor: number
  shortfall_minor: number
  week: {
    start: string; end: string; allowance_minor: number; spent_minor: number; left_minor: number; days_left: number
    plan: {
      joy_allowance_minor: number; joy_spent_minor: number; joy_left_minor: number
      needs_allowance_minor: number; needs_spent_minor: number; needs_left_minor: number; limited_by: "plan" | "money"
    } | null
  }
  note: string
}

export interface AttentionItem {
  kind: "short" | "bill_overdue" | "income_unconfirmed" | "owe_due" | "owed_overdue" | "budget_over" | "budget_at_risk"
  severity: "critical" | "warning" | "info"
  title?: string
  amount_minor: number
  date?: string
  ref_id?: string
  account_id?: string | null
  pct_used?: number
  is_overdue?: boolean
}

export interface CheckResult {
  amount_minor: number
  label: string | null
  verdict: "fits" | "stretch" | "over"
  safe_before_minor: number
  safe_after_minor: number
  raw_after_minor: number
  over_by_minor: number
  per_day_after_minor: number
  week_left_before_minor: number
  week_left_after_minor: number
  goal_impact: { goal: string; savings_at_risk_minor: number; delay_days: number | null; is_estimate: boolean } | null
  budget_impact: { category: string; remaining_before_minor: number; remaining_after_minor: number; would_exceed: boolean } | null
  plan_impact: { bucket: "joy" | "needs"; left_before_minor: number; left_after_minor: number } | null
  until: string
  period: "until_income" | "rolling"
  next_income_on: string | null
  next_income_label: string | null
  days_left: number
  buffer_minor: number
  commitments: CalcLineItem[]
  commitments_minor: number
  safe_to_spend: SafeToSpend
}

export interface Dashboard {
  period: { name: string; start: string; end: string; label: string }
  previous_period: { name: string; start: string; end: string; label: string }
  overview: {
    total_balance_minor: number
    total_balance_change_minor: number
    income_minor: number
    income_change_pct: number | null
    expense_minor: number
    expense_change_pct: number | null
    saved_minor: number
    saved_change_minor: number
    savings_rate: number | null
    transaction_count: number
  }
  spending_by_category: CategoryRow[]
  budget: Budget
  recent_transactions: Transaction[]
  goals: Goal[]
  upcoming: UpcomingItem[]
  accounts: Account[]
  safe_to_spend: SafeToSpend
  attention: AttentionItem[]
  money_owed: { you_owe_minor: number; owed_to_you_minor: number }
  has_data: boolean
}

export interface ForecastPoint {
  date: string
  p10: number
  p50: number
  p90: number
  event_minor?: number
}

export interface Forecast {
  start_balance_minor: number
  horizon_end: string
  days: ForecastPoint[]
  actual: { date: string; balance_minor: number }[]
  end_balance: { p10: number; p50: number; p90: number }
  lowest_point: { p50_minor: number; date: string }
  expected_income_minor: number
  scheduled_outflows_minor: number
  projected_discretionary_minor: number
  history_days: number
  sufficiency: "insufficient" | "low" | "ok"
  events: { date: string; amount_minor: number; label: string; kind: string }[]
  assumptions: string[]
  planned_savings_minor: number
  buffer_minor: number
  is_estimate: boolean
  safe_to_spend: SafeToSpend
}

export interface ScenarioResult {
  horizon_end: string
  lines: CalcLine[]
  projected_minor: number
  baseline_projected_minor: number
  delta_minor: number
  risk_level: "low" | "medium" | "high"
  verdict: "comfortable" | "tight" | "not_recommended"
  reasons: { code: string; [key: string]: unknown }[]
  savings_at_risk_minor: number
  goal_delay_days: number | null
  range: { p10: number; p50: number; p90: number }
  baseline_series: { date: string; p50: number }[]
  scenario_series: ForecastPoint[]
  sufficiency: string
  buffer_minor: number
  budget_impacts: { category: string; remaining_before_minor: number; remaining_after_minor: number; limit_minor: number }[]
}

export interface HealthComponent {
  key: string
  label: string
  weight: number
  effective_weight?: number
  value: number | null
  score: number | null
  counted: boolean
  measure: string
  explanation: string
}

export interface Health {
  formula_version: string
  score: number | null
  label: string | null
  eligible: boolean
  history_days: number
  components: HealthComponent[]
  disclaimer: string
}

export interface MonthlyReport {
  month: string
  label: string
  is_partial: boolean
  summary: {
    income_minor: number
    expense_minor: number
    net_minor: number
    savings_rate: number | null
    previous_income_minor: number
    previous_expense_minor: number
    previous_net_minor: number
    previous_savings_rate: number | null
    income_change_pct: number | null
    expense_change_pct: number | null
    transaction_count: number
    average_daily_spend_minor: number
  }
  spending_by_category: CategoryRow[]
  income_by_category: CategoryRow[]
  category_changes: { key: string; label: string; current_minor: number; previous_minor: number; delta_minor: number; delta_pct: number | null }[]
  top_merchants: { merchant_id: string; name: string; amount_minor: number; count: number }[]
  top_items: { name: string; amount_minor: number; count: number }[]
  daily_spending: { date: string; amount_minor: number }[]
  history: { month: string; label: string; income_minor: number; expense_minor: number; net_minor: number; savings_rate: number | null; is_partial: boolean }[]
  health: Health
}

export interface CaptureIssue {
  field: string
  code: string
  message: string
  blocking?: boolean
  options?: { id: string; label: string }[]
  transaction_id?: string
}

export interface CaptureDraft {
  type: TransactionType
  amount_minor: number | null
  occurred_on: string
  merchant: string | null
  category_id: string | null
  category_name: string | null
  subcategory_id: string | null
  subcategory_name: string | null
  account_id: string | null
  account_name: string | null
  to_account_id: string | null
  to_account_name: string | null
  payment_method: string | null
  notes: string | null
  items: { name: string; quantity: number; amount_minor: number }[]
  tags: string[]
  issues: CaptureIssue[]
  needs_confirmation: boolean
  learned_from_history: boolean
}

export interface CaptureResult {
  input: string
  is_financial: boolean
  parser: string
  provider_is_development: boolean
  drafts: CaptureDraft[]
}

export interface Receipt {
  id: string
  status: "processing" | "needs_review" | "confirmed" | "failed" | "unavailable" | "discarded"
  provider: string | null
  extraction: {
    type?: "expense" | "income" | "transfer"
    document_type?: string
    document_label?: string
    merchant: string | null
    occurred_on: string
    amount_minor: number | null
    items: { name: string; quantity: number; amount_minor: number }[]
    payment_method: string | null
    category_id: string | null
    subcategory_id?: string | null
    account_id?: string | null
    notes?: string | null
    due_date?: string | null
    reference?: string | null
  } | null
  issues: { field: string; code: string; message: string }[]
  error: string | null
  transaction_id: string | null
  has_image: boolean
  created_at: string
}

export type Block =
  | {
      type: "action"
      id: string
      action: string
      title: string
      lines: { label: string; value?: string; amount_minor?: number }[]
      request: { method: "POST" | "PUT" | "PATCH"; path: string; body: Record<string, unknown> }
      confirm: string
      done: string
      href: string
      mood: string
    }
  | {
      type: "challenges"
      title: string
      items: { id: string; title: string; kind: string; pct: number; state: string; on_track: boolean; summary: string; next_step?: string | null; days_left: number }[]
    }
  | {
      type: "ideas"
      title: string
      budget_minor: number | null
      items: { name: string; why: string; low_minor: number; high_minor: number; category_id: string | null }[]
      note: string
    }
  | { type: "stats"; title: string; items: { label: string; amount_minor?: number; value?: string; hint?: string }[] }
  | { type: "breakdown"; title: string; total_minor: number; rows: { label: string; amount_minor: number; pct: number; color: string }[] }
  | {
      type: "transactions"
      title: string
      total_minor: number
      count: number
      items: { ref: string; id: string; date: string; type: TransactionType; merchant: string | null; category: string | null; category_color: string | null; account: string; amount_minor: number }[]
    }
  | { type: "calculation"; title: string; lines: CalcLine[]; result_label: string; result_minor: number; note: string }
  | { type: "progress"; title: string; items: { label: string; current_minor: number; target_minor: number; pct: number; status: string; hint: string }[] }
  | { type: "forecast"; title: string; series: ForecastPoint[]; baseline?: { date: string; p50: number }[]; actual?: { date: string; balance_minor: number }[]; buffer_minor: number }
  | { type: "risk"; level: "low" | "medium" | "high"; verdict: string; reasons: string[] }
  | {
      type: "comparison"
      title: string
      current_label: string
      previous_label: string
      current_minor: number
      previous_minor: number
      delta_minor: number
      delta_pct: number | null
      drivers: { label: string; delta_minor: number; current_minor: number; previous_minor: number }[]
    }
  | { type: "list"; title: string; total_minor?: number; total_label?: string; items: { label: string; amount_minor: number; hint?: string }[] }
  | { type: "bars"; title: string; series: { label: string; income_minor: number; expense_minor: number; partial: boolean }[] }
  | ({ type: "health" } & Health)

export interface Source {
  ref: string
  type: string
  id: string
  label: string
  date: string | null
  snippet?: string
  amount_minor?: number
  cited: boolean
}

export interface ToolCallRecord {
  name: string
  arguments: Record<string, unknown>
  duration_ms: number
  ok: boolean
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  blocks: Block[]
  sources: Source[]
  follow_ups: string[]
  tool_calls: ToolCallRecord[]
  provider: string | null
  validation: string | null
  created_at: string
}

export interface SearchResults {
  query: string
  transactions: Transaction[]
  merchants: { id: string; name: string }[]
  items: { id: string; name: string; amount_minor: number; transaction_id: string }[]
  categories: { id: string; name: string; kind: string; color: string | null }[]
  goals: { id: string; name: string }[]
  accounts: { id: string; name: string; type: AccountType }[]
  memory: { entity_type: string; entity_id: string; title: string; snippet: string; date: string | null }[]
}

/** A Faldo pose and how close it is to unlocking: `progress` of `target` (days of streak, or things done). */
export interface Reward {
  id: string
  unlocked: boolean
  progress: number
  target: number
}

export interface Engagement {
  current_streak: number
  best_streak: number
  logged_today: boolean
  restores_left: number
  restores_per_month: number
  logged_days_total: number
  week: { date: string; logged: boolean }[]
  outfits: Reward[]
}

export interface BalancePoint {
  date: string
  assets_minor: number
  liabilities_minor: number
  net_minor: number
}

export interface FinancialNote {
  id: string
  content: string
  related_goal_id: string | null
  created_at: string
}

export interface PlannedPurchase {
  id: string
  name: string
  amount_minor: number
  url: string | null
  category_id: string | null
  category_name: string | null
  target_date: string | null
  priority: "low" | "medium" | "high"
  notes: string | null
  status: "planned" | "bought" | "dropped"
  pause_until: string | null
  is_paused: boolean
  verdict: "fits" | "stretch" | "over" | null
  safe_after_minor: number | null
  over_by_minor: number | null
  affordable_on: string | null
  affordable_is_estimate: boolean
  bought_transaction_id: string | null
  created_at: string
}

export interface MoneyPlanBucket {
  key: "commitments" | "needs" | "joy" | "savings" | "buffer"
  label: string
  amount_minor: number
  auto: boolean
  pct: number | null
}

export interface MoneyPlan {
  configured: boolean
  period: { frequency: string; label: string; days: number; has_schedule: boolean; income_name: string | null; start: string; end: string }
  income: { minor: number | null; source: "custom" | "schedule" | null; scheduled_minor: number | null }
  commitments_minor: number
  goal_savings_minor: number
  plan: { savings_minor: number; joy_minor: number; buffer_minor: number; needs_minor: number | null; template: string; income_minor: number | null }
  allocation: {
    buckets: MoneyPlanBucket[]
    needs_minor: number
    unassigned_minor: number
    pct_unassigned: number | null
    warnings: { code: "bills_exceed_income" | "over_assigned" | "savings_below_goals"; amount_minor: number }[]
  } | null
  template_60_20_20: { savings_minor: number; joy_minor: number; buffer_minor: number; needs_minor: number; bills_over_needs_share_minor: number } | null
  weekly: { joy_minor: number; needs_minor: number } | null
  this_period: {
    joy_minor: number; joy_spent_minor: number; joy_left_minor: number
    needs_minor: number; needs_spent_minor: number; needs_left_minor: number
  } | null
  categories: { id: string; name: string; is_essential: boolean; icon: string | null; color: string | null }[]
}


export interface ChallengeProgress {
  id: string
  kind: "ipon_daily" | "ipon_52" | "no_spend" | "spend_cap"
  title: string
  status: "active" | "ended"
  state: "active" | "completed" | "missed"
  start_on: string
  end_on: string
  days_total: number
  days_elapsed: number
  days_left: number
  pct: number
  on_track: boolean
  summary: string
  next_step?: string | null
  goal_id: string | null
  category_id: string | null
  saved_minor?: number
  target_minor?: number
  this_week_minor?: number
  spent_minor?: number
  cap_minor?: number
  clean_days?: number
}
