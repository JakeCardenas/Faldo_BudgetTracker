"use client"

import { format, parseISO } from "date-fns"
import { Check, Lock, RotateCcw, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Mascot } from "@/components/brand/mascot"
import { Scene } from "@/components/brand/scene"
import { LargeTitle } from "@/components/ios/nav-header"
import { Skeleton } from "@/components/ui/skeleton"
import { BACKGROUND_INFO, BADGE_ART, OUTFIT_INFO } from "@/lib/catalog"
import { useEngagement, useMe, useUpdateSettings } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Badge } from "@/lib/types"
import { cn } from "@/lib/utils"

const HEX = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)"

function BadgeHex({ badge, size = "size-16" }: { badge: Badge; size?: string }) {
  const art = BADGE_ART[badge.id] ?? { emoji: "⭐", color: "#4a7f52" }
  return (
    <div className={cn("relative", size)}>
      <div className="absolute inset-0" style={{ clipPath: HEX, background: badge.earned ? `linear-gradient(160deg, ${art.color}, color-mix(in oklab, ${art.color}, black 30%))` : "var(--muted)" }} />
      <div className="absolute inset-[9%]" style={{ clipPath: HEX, background: badge.earned ? "color-mix(in oklab, white, transparent 82%)" : "var(--card)" }} />
      <span className={cn("absolute inset-0 flex items-center justify-center text-2xl", !badge.earned && "opacity-30 grayscale")} aria-hidden>{art.emoji}</span>
      {!badge.earned && <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border bg-card"><Lock className="size-2.5 text-muted-foreground" /></span>}
    </div>
  )
}

export default function StreaksPage() {
  const { data: me } = useMe()
  const { data, isLoading } = useEngagement()
  const update = useUpdateSettings()

  function wear(kind: "mascot_outfit" | "home_background", id: string, unlocked: boolean, hint: string) {
    if (!unlocked) { play("disabled"); toast(`Locked · ${hint}`); return }
    update.mutate({ [kind]: id }, {
      onSuccess: () => { play("celebrate"); toast(kind === "mascot_outfit" ? "New look equipped!" : "Background updated") },
      onError: (e) => toast.error(e.message),
    })
  }

  if (isLoading || !data) {
    return <div className="space-y-4"><LargeTitle title="Streaks" back={{ href: "/", label: "Home" }} /><Skeleton className="h-64 rounded-[1.75rem]" /><Skeleton className="h-40 rounded-[1.5rem]" /></div>
  }

  const next = data.next_badge
  const streakBadges = data.badges.filter((b) => b.group === "streak")
  const milestoneBadges = data.badges.filter((b) => b.group === "milestone")

  return (
    <div className="space-y-5">
      <LargeTitle title="Streaks" subtitle="Log a little every day. Build the habit, earn rewards." back={{ href: "/", label: "Home" }} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="card-surface relative overflow-hidden px-5 py-8 text-center">
          <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto size-72 rounded-full bg-[#ffb35c]/20 blur-3xl" aria-hidden />
          <div className="relative">
            <div className={cn("mx-auto text-7xl", data.current_streak > 0 && "animate-flicker")} aria-hidden>{data.current_streak > 0 ? "🔥" : "🪵"}</div>
            <p className="tabular mt-2 text-7xl leading-none font-extrabold tracking-tight">{data.current_streak}</p>
            <p className="mt-1 text-2xl font-extrabold text-primary">day streak!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.logged_today ? "Today already counts. See you tomorrow!" : data.current_streak > 0 ? "Log something today to keep it going." : "Log a transaction to start a new streak."}
            </p>
            <div className="mx-auto mt-5 flex max-w-sm justify-between gap-1.5">
              {data.week.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className={cn("flex size-9 items-center justify-center rounded-full border-2",
                    d.logged ? "border-transparent bg-primary text-primary-foreground" : "border-dashed border-muted-foreground/30 text-muted-foreground")}>
                    {d.logged ? <Check className="size-4" strokeWidth={3} /> : null}
                  </span>
                  <span className="text-[0.65rem] font-bold text-muted-foreground">{format(parseISO(d.date), "EEEEE")}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs font-semibold text-muted-foreground">Best streak {data.best_streak} days · {data.logged_days_total} days tracked</p>
          </div>
        </section>

        <div className="space-y-4">
          <section className="card-surface flex items-center gap-4 p-4 sm:p-5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary"><RotateCcw className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold tracking-tight">Streak restores</h2>
              <p className="text-xs text-muted-foreground">Miss a single day this month and a restore keeps your streak alive. Resets monthly · unused restores don&apos;t roll over.</p>
            </div>
            <div className="text-center">
              <p className="tabular text-2xl font-extrabold">{data.restores_left}</p>
              <p className="eyebrow">of {data.restores_per_month}</p>
            </div>
          </section>

          {next && (
            <section className="card-surface flex items-center gap-4 p-4 sm:p-5">
              <BadgeHex badge={next} />
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-primary">Next badge</p>
                <h2 className="text-lg font-extrabold tracking-tight">{next.name}</h2>
                <p className="text-xs text-muted-foreground">{next.progress} completed · {next.threshold - next.progress} remaining</p>
                {next.threshold <= 14 ? (
                  <div className="mt-2 flex gap-1">
                    {Array.from({ length: next.threshold }).map((_, i) => <span key={i} className={cn("h-2 flex-1 rounded-full", i < next.progress ? "bg-primary" : "bg-muted")} />)}
                  </div>
                ) : (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(next.progress / next.threshold) * 100}%` }} /></div>
                )}
              </div>
            </section>
          )}

          <section className="card-surface flex items-center gap-4 overflow-hidden p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold tracking-tight">Rewards</h2>
              <p className="text-xs text-muted-foreground">Unlock new outfits and backgrounds with your badges.</p>
              <p className="mt-2 flex items-center gap-1 text-sm font-bold text-primary"><Sparkles className="size-4" /> {data.outfits.filter((o) => o.unlocked).length + data.backgrounds.filter((b) => b.unlocked).length} of {data.outfits.length + data.backgrounds.length} unlocked</p>
            </div>
            <Mascot outfit={me?.settings.mascot_outfit} mood="proud" className="w-20 shrink-0" />
          </section>
        </div>
      </div>

      <section className="card-surface p-4 sm:p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold tracking-tight">Collected badges</h2>
          <span className="text-sm font-bold text-muted-foreground">{data.earned_count} of {data.badges.length}</span>
        </div>
        {[{ title: "Streak sparks", list: streakBadges }, { title: "Milestones", list: milestoneBadges }].map((group) => (
          <div key={group.title} className="mt-4">
            <p className="eyebrow">{group.title}</p>
            <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-8">
              {group.list.map((badge) => (
                <li key={badge.id} className="flex flex-col items-center text-center" title={badge.description}>
                  <BadgeHex badge={badge} />
                  <p className={cn("mt-1.5 text-xs font-bold", !badge.earned && "text-muted-foreground")}>{badge.name}</p>
                  <p className="text-[0.62rem] text-muted-foreground">{badge.group === "streak" ? `${badge.threshold} day${badge.threshold === 1 ? "" : "s"}` : badge.earned ? "Earned" : badge.description.replace(/\.$/, "")}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h2 className="text-lg font-extrabold tracking-tight">Wardrobe</h2>
        <p className="text-xs text-muted-foreground">Keep your streak going to unlock more looks for Faldo.</p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.outfits.map((outfit) => {
            const info = OUTFIT_INFO[outfit.id] ?? { name: outfit.id, hint: "" }
            const selected = me?.settings.mascot_outfit === outfit.id
            return (
              <li key={outfit.id}>
                <button type="button" onClick={() => wear("mascot_outfit", outfit.id, outfit.unlocked, info.hint)} aria-pressed={selected}
                  className={cn("pressable relative flex w-full flex-col items-center rounded-[1.25rem] border p-3 text-center transition-colors",
                    selected ? "border-primary bg-primary text-primary-foreground" : "bg-surface hover:bg-secondary/50")}>
                  {selected && <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary-foreground text-primary"><Check className="size-3" strokeWidth={3} /></span>}
                  {!outfit.unlocked && <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-muted"><Lock className="size-3 text-muted-foreground" /></span>}
                  <Mascot outfit={outfit.id} coin={false} mood={outfit.unlocked ? "happy" : "sleepy"} className={cn("w-20", !outfit.unlocked && "opacity-40 grayscale")} />
                  <p className="mt-1 text-sm font-bold">{info.name}</p>
                  <p className={cn("text-[0.65rem]", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{outfit.unlocked ? (selected ? "Wearing" : "Tap to wear") : info.hint}</p>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h2 className="text-lg font-extrabold tracking-tight">Backgrounds</h2>
        <p className="text-xs text-muted-foreground">Change the scene behind Faldo on your Home and Wallet.</p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.backgrounds.map((bg) => {
            const info = BACKGROUND_INFO[bg.id] ?? { name: bg.id, hint: "" }
            const selected = me?.settings.home_background === bg.id
            return (
              <li key={bg.id}>
                <button type="button" onClick={() => wear("home_background", bg.id, bg.unlocked, info.hint)} aria-pressed={selected}
                  className={cn("pressable w-full overflow-hidden rounded-[1.25rem] border text-left", selected && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
                  <div className={cn("relative h-20", !bg.unlocked && "opacity-40 grayscale")}>
                    <Scene id={bg.id} />
                    {!bg.unlocked && <span className="absolute inset-0 flex items-center justify-center"><Lock className="size-5 text-white drop-shadow" /></span>}
                  </div>
                  <div className="bg-card px-3 py-2">
                    <p className="text-sm font-bold">{info.name}</p>
                    <p className="truncate text-[0.65rem] text-muted-foreground">{bg.unlocked ? (selected ? "In use" : "Tap to use") : info.hint}</p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
