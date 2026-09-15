"use client"

import Link from "next/link"
import { MessageCircle, Search } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { Notifications } from "@/components/layout/notifications"
import { StreakChip } from "@/components/layout/streak-chip"

export function Topbar() {
  const { openSearch } = useAppActions()
  return (
    <header className="glass sticky top-0 z-30 hidden border-b border-border/50 lg:block">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-8">
        <button onClick={openSearch} aria-label="Search"
          className="flex h-10 w-96 items-center gap-2 rounded-full border bg-card px-4 text-sm text-muted-foreground shadow-(--shadow-card) transition-colors hover:text-foreground">
          <Search className="size-4" strokeWidth={2} />
          <span className="flex-1 text-left">Search transactions, goals, items…</span>
          <kbd className="rounded-md border bg-muted px-1.5 font-mono text-[0.65rem]">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <StreakChip />
          <Notifications />
          <Link href="/assistant" className="pressable flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-bold text-secondary-foreground">
            <MessageCircle className="size-4" /> Talk to Faldo
          </Link>
        </div>
      </div>
    </header>
  )
}
