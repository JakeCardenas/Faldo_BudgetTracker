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

export function HomeTopBar() {
  const { openSearch } = useAppActions()
  return (
    <div className="flex items-center gap-2 pt-safe lg:hidden">
      <div className="flex h-14 w-full items-center gap-2">
        <StreakChip />
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={openSearch} aria-label="Search"
            className="pressable flex size-10 items-center justify-center rounded-full border bg-card text-foreground/80 shadow-(--shadow-card)">
            <Search className="size-[1.1rem]" />
          </button>
          <div className="flex size-10 items-center justify-center rounded-full border bg-card shadow-(--shadow-card)"><Notifications /></div>
          <Link href="/settings" aria-label="Settings" className="pressable flex size-10 items-center justify-center rounded-full border bg-card text-foreground/80 shadow-(--shadow-card)">
            <Settings className="size-[1.1rem]" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export function GreetingBand({ mood }: { mood: MascotMood }) {
  const { data: me } = useMe()
  const { data: pulse, isLoading } = usePulse()
  return (
    <section className="space-y-3 lg:space-y-4">
      <div className="px-1 lg:pt-2">
        <p className="eyebrow">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
        <h1 className="mt-1 text-[1.85rem] leading-tight font-medium tracking-tight sm:text-4xl">
          {greeting()}, <span className="font-extrabold">{me?.display_name}</span>!
        </h1>
      </div>
      <div className="relative -mx-4 sm:mx-0">
        <div className="absolute inset-x-0 bottom-0 h-[62%] overflow-hidden sm:rounded-[1.75rem]">
          <Scene id={me?.settings.home_background ?? "meadow"} />
        </div>
        <div className="relative flex items-end gap-1 px-3 pt-2 sm:gap-3 sm:px-5">
          <Mascot mood={mood} outfit={me?.settings.mascot_outfit} className="animate-bob mb-1 w-[6.5rem] shrink-0 drop-shadow-md sm:w-32" />
          <div className="relative mb-4 min-w-0 flex-1 rounded-[1.4rem] rounded-bl-md border bg-card p-3.5 shadow-(--shadow-float) sm:mb-6 sm:p-4">
            <p className="text-xs font-extrabold text-primary">Faldo</p>
            {isLoading || !pulse ? (
              <div className="space-y-2 pt-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
            ) : (
              <p className="mt-0.5 line-clamp-4 text-[0.85rem] leading-relaxed sm:text-[0.92rem]">{pulse.text}</p>
            )}
            <Link href="/assistant" className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              Talk to Faldo <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
