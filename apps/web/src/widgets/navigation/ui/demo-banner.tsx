"use client"

import { useState } from "react"
import { useLogout } from "./user-menu"

/**
 * The slim strip across the top of every screen in a demo: it says this is sample data and offers the way to a real
 * account. Creating one ends the demo first (its sample data is deleted) and goes to Create account.
 *
 * It covers the status bar area itself, so the app shell sets the page's own top inset to zero under it and moves
 * sticky headers down by its height (--sticky-top).
 */
export function DemoBanner() {
  const leave = useLogout("/register")
  const [leaving, setLeaving] = useState(false)
  return (
    <div role="region" aria-label="Demo" className="sticky top-0 z-40 bg-secondary pt-(--top-inset) text-secondary-foreground">
      <div className="mx-auto flex h-11 max-w-[1160px] items-center justify-between gap-3 pl-5 pr-3 text-[0.8125rem] sm:pl-6 sm:pr-4 lg:pl-10 lg:pr-8">
        <p className="min-w-0 truncate">
          <span className="font-semibold">You&apos;re exploring a demo</span>
          <span className="max-[389px]:hidden"> with sample data</span>
        </p>
        <button type="button" disabled={leaving} onClick={() => { setLeaving(true); void leave() }}
          className="pressable h-11 shrink-0 rounded-full px-2 font-bold underline decoration-1 underline-offset-4 hover:decoration-2 disabled:opacity-60">
          Create your account
        </button>
      </div>
    </div>
  )
}
