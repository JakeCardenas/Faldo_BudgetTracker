"use client"

import { useState } from "react"
import { Check, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { IosSheet } from "@/components/ios/sheet"
import { Panel } from "@/components/ios/panel"
import { QUICK_ACTIONS, resolveQuickActions } from "@/components/layout/actions-catalog"
import { useAppActions } from "@/components/layout/app-context"
import { ActionTile, useRunAction } from "@/components/layout/more-sheet"
import { Button } from "@/components/ui/button"
import { useMe, useUpdateSettings } from "@/lib/queries"
import { cn } from "@/lib/utils"

const MAX = 7

export function QuickActionsCard({ className }: { className?: string }) {
  const { data: me } = useMe()
  const { openMore } = useAppActions()
  const run = useRunAction()
  const update = useUpdateSettings()
  const [editing, setEditing] = useState(false)
  const actions = resolveQuickActions(me?.settings.quick_actions)
  const [draft, setDraft] = useState<string[]>([])

  return (
    <Panel title="Shortcuts" className={className}
      action={<Button variant="ghost" size="sm" className="-mr-2 text-primary" onClick={() => { setDraft(actions.map((a) => a.id)); setEditing(true) }}>Edit</Button>}>
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-6 lg:grid-cols-4 sm:gap-x-2 sm:gap-y-3 sm:overflow-visible sm:px-0 [&>button]:w-[4.5rem] [&>button]:shrink-0 sm:[&>button]:w-auto">
        {actions.map((action) => <ActionTile key={action.id} action={action} onPick={run} compact />)}
        <ActionTile action={{ id: "more", label: "More", icon: MoreHorizontal, group: "Tools" }} onPick={openMore} compact />
      </div>

      <IosSheet open={editing} onOpenChange={setEditing} title="Edit shortcuts" description={`Pick up to ${MAX} shortcuts for your home screen.`}
        footer={
          <Button size="lg" className="w-full" disabled={update.isPending} onClick={() => update.mutate({ quick_actions: draft }, {
            onSuccess: () => { setEditing(false); toast.success("Shortcuts updated") },
            onError: (e) => toast.error(e.message),
          })}>{update.isPending ? "Saving…" : "Save"}</Button>
        }>
        <p className="mb-3 text-[0.8125rem] text-muted-foreground"><span className="tabular">{draft.length}</span> of {MAX} selected</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action) => {
            const selected = draft.includes(action.id)
            const Icon = action.icon
            return (
              <button key={action.id} type="button" aria-pressed={selected}
                onClick={() => setDraft((d) => selected ? d.filter((x) => x !== action.id) : d.length >= MAX ? d : [...d, action.id])}
                className={cn("pressable flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/60",
                  selected && "border-primary/40 bg-secondary/60 hover:bg-secondary/60")}>
                <Icon className={cn("size-4.5", selected ? "text-primary" : "text-muted-foreground")} strokeWidth={1.85} />
                <span className="min-w-0 flex-1 truncate text-sm">{action.label}</span>
                <span className={cn("flex size-5 items-center justify-center rounded-full border", selected && "border-primary bg-primary text-primary-foreground")}>
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </div>
      </IosSheet>
    </Panel>
  )
}
