"use client"

import { useRouter } from "next/navigation"
import { IosSheet } from "@/components/ios/sheet"
import { useAppActions } from "@/components/layout/app-context"
import { QUICK_ACTIONS, type QuickAction } from "@/components/layout/actions-catalog"

const GROUPS: QuickAction["group"][] = ["Log", "Plan", "Understand", "Tools"]

export function ActionTile({ action, onPick, highlight, compact }: { action: QuickAction; onPick: (action: QuickAction) => void; highlight?: boolean; compact?: boolean }) {
  const Icon = action.icon
  const tileSize = compact ? "size-11 sm:size-13" : "size-13"
  return (
    <button type="button" onClick={() => onPick(action)} className="group pressable flex min-w-0 flex-col items-center gap-1.5 rounded-2xl py-1.5 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
      <span className={highlight
        ? `flex ${tileSize} items-center justify-center rounded-[1.1rem] bg-primary text-primary-foreground shadow-(--shadow-card)`
        : `flex ${tileSize} items-center justify-center rounded-[1.1rem] border bg-card text-primary shadow-(--shadow-card) transition-colors group-hover:bg-secondary`}>
        <Icon className="size-[1.35rem]" strokeWidth={2} />
      </span>
      <span className={`w-full truncate text-center leading-tight font-semibold text-foreground/80 ${compact ? "text-[0.62rem] sm:text-[0.7rem]" : "text-[0.7rem]"}`}>{action.label}</span>
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
    <IosSheet open={open} onOpenChange={onOpenChange} title="Everything in Faldo" description="Log, plan, learn and use handy money tools.">
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group} className="space-y-2">
            <h3 className="eyebrow px-1">{group}</h3>
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
