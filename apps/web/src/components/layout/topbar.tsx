"use client"

import Link from "next/link"
import { Search } from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { useAppActions } from "@/components/layout/app-context"
import { Notifications } from "@/components/layout/notifications"
import { UserMenu } from "@/components/layout/user-menu"

export function Topbar() {
  const { openSearch } = useAppActions()
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-4 sm:px-6 lg:h-16 lg:px-8">
        <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="Faldo home">
          <LogoMark className="size-7" />
          <span className="font-semibold tracking-tight">Faldo</span>
        </Link>
        <button
          onClick={openSearch}
          className="ml-auto flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:ml-0 lg:w-80 lg:border lg:bg-card lg:px-3"
          aria-label="Search"
        >
          <Search className="size-[1.1rem] lg:size-4" strokeWidth={1.9} />
          <span className="hidden flex-1 text-left lg:inline">Search transactions, goals, items…</span>
          <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[0.65rem] lg:inline">⌘K</kbd>
        </button>
        <div className="flex items-center gap-1 lg:ml-auto">
          <Notifications />
          <div className="lg:hidden"><UserMenu /></div>
        </div>
      </div>
    </header>
  )
}
