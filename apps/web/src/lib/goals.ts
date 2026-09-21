import { formatDate, formatMoney } from "@/lib/format"
import type { Goal } from "@/lib/types"

/** A plain sentence for where a goal stands, from the engine's status code and figures. */
export function goalStatusLine(goal: Goal) {
  const target = goal.target_date ? formatDate(goal.target_date, "MMM yyyy") : null
  const projected = goal.projected_completion_on ? formatDate(goal.projected_completion_on, "MMM yyyy") : null
  switch (goal.status_reason) {
    case "completed":
      return "Goal reached"
    case "on_pace":
      return target ? `On track for ${target}` : "On track"
    case "behind_pace":
      return goal.required_monthly_minor && target
        ? `Behind pace. About ${formatMoney(goal.required_monthly_minor)} a month reaches it by ${target}.`
        : "Behind the pace for your date"
    case "no_contributions":
      return "Add money to see when you'll get there"
    default:
      return projected ? `At this pace, done by ${projected}` : "No target date yet"
  }
}
