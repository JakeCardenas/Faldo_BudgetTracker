"use client"

import { useState } from "react"
import { Check, MoreHorizontal, Pencil } from "lucide-react"
import { toast } from "sonner"
import { IosSheet } from "@/components/ios/sheet"
import { QUICK_ACTIONS, resolveQuickActions } from "@/components/layout/actions-catalog"
import { useAppActions } from "@/components/layout/app-context"
import { ActionTile, useRunAction } from "@/components/layout/more-sheet"
import { useMe, useUpdateSettings } from "@/lib/queries"
import { cn } from "@/lib/utils"

const MAX = 7

export function QuickActionsCard() {
  const { data: me } = useMe()
  const { openMore } = useAppActions()
  const run = useRunAction()
  const update = useUpdateSettings()
  const [editing, setEditing] = useState(false)
  const actions = resolveQuickActions(me?.settings.quick_actions)
  const [draft, setDraft] = useState<string[]>([])

  return (
    <section className="card-surface p-4 sm:p-5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-extrabold tracking-tight">Quick actions</h2>
        <button type="button" onClick={() => { setDraft(actions.map((a) => a.id)); setEditing(true) }} aria-label="Edit quick actions"
          className="pressable flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><Pencil className="size-4" /></button>
      </div>
      <div className={cn("mt-3 grid gap-x-1 gap-y-3 sm:grid-cols-8", actions.length <= 5 ? "grid-cols-6" : "grid-cols-4")}>
        {actions.map((action) => <ActionTile key={action.id} action={action} onPick={run} compact={actions.length <= 5} />)}
        <ActionTile action={{ id: "more", label: "More", icon: MoreHorizontal, group: "Tools" }} onPick={openMore} compact={actions.length <= 5} />
      </div>

      <IosSheet open={editing} onOpenChange={setEditing} title="Edit quick actions" description={`Pick up to ${MAX} shortcuts for your home screen.`}
        footer={
          <button type="button" disabled={update.isPending} onClick={() => update.mutate({ quick_actions: draft }, {
            onSuccess: () => { setEditing(false); toast.success("Quick actions updated") },
            onError: (e) => toast.error(e.message),
          })} className="pressable h-12 w-full rounded-2xl bg-primary text-sm font-bold text-primary-foreground">Save</button>
        }>
        <p className="mb-3 text-xs font-semibold text-muted-foreground">{draft.length} of {MAX} selected</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_ACTIONS.map((action) => {
            const selected = draft.includes(action.id)
            const Icon = action.icon
            return (
              <button key={action.id} type="button" aria-pressed={selected}
                onClick={() => setDraft((d) => selected ? d.filter((x) => x !== action.id) : d.length >= MAX ? d : [...d, action.id])}
                className={cn("pressable flex items-center gap-2.5 rounded-2xl border bg-card p-2.5 text-left", selected && "border-primary bg-secondary")}>
                <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary"><Icon className="size-4.5" /></span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{action.label}</span>
                {selected && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      </IosSheet>
    </section>
  )
}
