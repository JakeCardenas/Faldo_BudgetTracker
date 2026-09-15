"use client"

import Link from "next/link"
import { ArrowRight, Search, Settings } from "lucide-react"
import { Mascot, type MascotMood } from "@/components/brand/mascot"
import { Scene } from "@/components/brand/scene"
import { useAppActions } from "@/components/layout/app-context"
import { Notifications } from "@/components/layout/notifications"
import { StreakChip } from "@/components/layout/streak-chip"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, greeting } from "@/lib/format"
import { useMe, usePulse } from "@/lib/queries"
import { cn } from "@/lib/utils"

const ICON_BUTTON = "pressable flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"

export function HomeTopBar() {
  const { openSearch } = useAppActions()
  return (
    <div className="-mx-1 flex h-12 items-center gap-1 pt-safe lg:hidden">
      <StreakChip />
      <div className="ml-auto flex items-center">
        <button type="button" onClick={openSearch} aria-label="Search" className={ICON_BUTTON}>
          <Search className="size-[1.15rem]" strokeWidth={1.85} />
        </button>
        <Notifications />
        <Link href="/settings" aria-label="Settings" className={ICON_BUTTON}>
          <Settings className="size-[1.15rem]" strokeWidth={1.85} />
        </Link>
      </div>
    </div>
  )
}

export function HomeHeader() {
  const { data: me } = useMe()
  const name = me?.display_name?.split(" ")[0]
  return (
    <header className="pt-2 pb-1 lg:pt-10">
      <p className="text-[0.8125rem] text-muted-foreground">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
      <h1 className="page-title mt-0.5 lg:text-[1.875rem]">{greeting()}{name ? `, ${name}` : ""}</h1>
    </header>
  )
}

export function CompanionCard({ mood, className }: { mood: MascotMood; className?: string }) {
  const { data: me } = useMe()
  const { data: pulse, isLoading } = usePulse()
  return (
    <section className={cn("card-surface flex gap-4 p-4 sm:p-5", className)}>
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-secondary" aria-hidden>
        <Scene id={me?.settings.home_background ?? "meadow"} className="absolute inset-0" />
        <Mascot mood={mood} outfit={me?.settings.mascot_outfit} coin={false} className="absolute -bottom-1 left-1/2 w-14 -translate-x-1/2" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium text-muted-foreground">Faldo</p>
        {isLoading || !pulse ? (
          <div className="space-y-2 pt-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
        ) : (
          <p className="mt-0.5 line-clamp-4 text-sm leading-relaxed">{pulse.text}</p>
        )}
        <Link href="/assistant" className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-primary hover:opacity-80">
          Talk to Faldo <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  )
}
