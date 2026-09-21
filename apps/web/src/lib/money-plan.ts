import type { MoneyPlanBucket } from "@/lib/types"

/** One colour per money plan bucket, shared by the plan editor and its summaries. */
export const BUCKET_COLORS: Record<MoneyPlanBucket["key"] | "unassigned", string> = {
  commitments: "var(--muted-foreground)",
  needs: "var(--primary)",
  joy: "var(--chart-4)",
  savings: "var(--chart-2)",
  buffer: "var(--chart-3)",
  unassigned: "var(--border)",
}
