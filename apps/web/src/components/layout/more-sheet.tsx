"use client"

import { useRouter } from "next/navigation"
import { IosSheet } from "@/components/ios/sheet"
import { useAppActions } from "@/components/layout/app-context"
import { QUICK_ACTIONS, type QuickAction } from "@/components/layout/actions-catalog"
import { play } from "@/lib/sound"

const GROUPS: QuickAction["group"][] = ["Log", "Plan", "Understand", "Tools"]

export function ActionTile({ action, onPick, highlight, compact }: { action: QuickAction; onPick: (action: QuickAction) => void; highlight?: boolean; compact?: boolean }) {
  const Icon = action.icon
  return (
    <button type="button" onClick={() => { play("tap"); onPick(action) }} className="group pressable flex min-w-0 flex-col items-center gap-2 rounded-xl py-1 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
      <span className={highlight
        ? "flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"
        : "flex size-12 items-center justify-center rounded-xl bg-muted text-foreground/80 transition-colors group-hover:bg-secondary group-hover:text-secondary-foreground"}>
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <span className={`w-full truncate text-center leading-tight text-foreground/80 ${compact ? "text-[0.6875rem] sm:text-xs" : "text-xs"}`}>{action.label}</span>
    </button>
  )
}

export function useRunAction() {
  const router = useRouter()
  const { openAddTransaction } = useAppActions()
  return (action: QuickAction) => {
    if (action.add) openAddTransaction({ mode: action.add })
    else if (action.href) router.push(action.href)
  }
}

export function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const run = useRunAction()
  return (
    <IosSheet open={open} onOpenChange={onOpenChange} title="Everything in Faldo">
      <div className="space-y-6">
        {GROUPS.map((group) => (
          <section key={group} className="space-y-3">
            <h3 className="text-[0.8125rem] font-medium text-muted-foreground">{group}</h3>
            <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6">
              {QUICK_ACTIONS.filter((a) => a.group === group).map((action) => (
                <ActionTile key={action.id} action={action} onPick={(a) => { onOpenChange(false); run(a) }} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </IosSheet>
  )
}
