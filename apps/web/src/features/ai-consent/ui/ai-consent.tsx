"use client"

import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/shared/ui/button"
import { api, ApiError } from "@/shared/api/client"
import type { Me } from "@/shared/api/types"

export function useAiChoice() {
  const qc = useQueryClient()
  const [saving, setSaving] = useState<"allowed" | "declined" | null>(null)
  async function choose(choice: "allowed" | "declined") {
    setSaving(choice)
    try {
      qc.setQueryData(["me"], await api.put<Me>("/me/ai-consent", { choice }))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save your choice.")
    } finally {
      setSaving(null)
    }
  }
  return { choose, saving }
}

const names = (me: Me) => {
  const list = me.ai.providers.map((p) => p.name)
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0] ?? ""
}

/**
 * Asked once before anything personal goes to an outside AI service (the server refuses until then). It says which
 * service, what is sent and what that service says it does with it, and offers a way to keep Faldo on its own rules.
 */
export function AiConsentCard({ me, purpose = "chat" }: { me: Me; purpose?: "chat" | "photos" }) {
  const { choose, saving } = useAiChoice()
  return (
    <section aria-labelledby="ai-consent-title" className="space-y-3 rounded-2xl border bg-card p-4 text-sm shadow-(--shadow-card)">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1.5">
          <h2 id="ai-consent-title" className="font-semibold">
            {purpose === "chat" ? "Before Faldo's AI answers" : "Before Faldo reads your photos"}
          </h2>
          <p className="text-muted-foreground">
            To {purpose === "chat" ? "answer" : "read receipts and screenshots"}, Faldo sends this to {names(me)}: {me.ai.sends}
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {me.ai.providers.map((p) => (
              <li key={p.id}>
                {p.data_use}{" "}
                {p.source && <a href={p.source} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">{p.company}&apos;s terms</a>}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Without it, Faldo still works on its own rules: basic answers from your numbers and manual receipt entry. You can change this any time in Settings. <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">Privacy notice</Link>
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={saving !== null} onClick={() => choose("declined")}>
          {saving === "declined" && <Loader2 className="animate-spin" />} Use Faldo without outside AI
        </Button>
        <Button disabled={saving !== null} onClick={() => choose("allowed")}>
          {saving === "allowed" && <Loader2 className="animate-spin" />} Allow
        </Button>
      </div>
    </section>
  )
}
