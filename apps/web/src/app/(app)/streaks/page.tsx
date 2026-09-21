"use client"

import { format, parseISO } from "date-fns"
import { Award, Check, Flame, Lock } from "lucide-react"
import { toast } from "sonner"
import { BambooDecor, environmentStyle } from "@/components/brand/environment"
import { Panda } from "@/components/brand/panda"
import { LargeTitle } from "@/components/ios/nav-header"
import { Skeleton } from "@/components/ui/skeleton"
import { BACKGROUND_INFO, BADGE_ART, OUTFIT_INFO, poseFor } from "@/lib/catalog"
import { useEngagement, useMe, useUpdateSettings } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Badge } from "@/lib/types"
import { cn } from "@/lib/utils"

function BadgeMark({ badge, size = "md" }: { badge: Badge; size?: "md" | "lg" }) {
  const Icon = BADGE_ART[badge.id]?.icon ?? Award
  return (
    <div className={cn("relative flex shrink-0 items-center justify-center rounded-xl", size === "lg" ? "size-14" : "size-12",
      badge.earned ? "bg-secondary text-primary" : "bg-muted text-muted-foreground/45")}>
      <Icon className={size === "lg" ? "size-6" : "size-5"} strokeWidth={1.75} />
      {!badge.earned && <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border bg-card"><Lock className="size-2.5 text-muted-foreground" /></span>}
    </div>
  )
}

export default function StreaksPage() {
  const { data: me } = useMe()
  const { data, isLoading } = useEngagement()
  const update = useUpdateSettings()

  function wear(kind: "mascot_outfit" | "home_background", id: string, unlocked: boolean, hint: string) {
    if (!unlocked) { play("disabled"); toast(`Locked. ${hint}`); return }
    update.mutate({ [kind]: id }, {
      onSuccess: () => { play("celebrate"); toast(kind === "mascot_outfit" ? "Faldo's pose updated on Home" : "Home environment updated") },
      onError: (e) => toast.error(e.message),
    })
  }

  if (isLoading || !data) {
    return <div className="space-y-4"><LargeTitle title="Streaks" back={{ href: "/you", label: "You" }} /><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>
  }

  const next = data.next_badge
  const streakBadges = data.badges.filter((b) => b.group === "streak")
  const milestoneBadges = data.badges.filter((b) => b.group === "milestone")

  return (
    <div className="space-y-5">
      <LargeTitle title="Streaks" subtitle="Log a little every day to build the habit and earn rewards" back={{ href: "/you", label: "You" }} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.1fr_1fr] lg:gap-5">
        <section className="card-surface px-5 py-7 text-center sm:py-8">
          <span className={cn("mx-auto flex size-12 items-center justify-center rounded-xl", data.current_streak > 0 ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
            <Flame className={cn("size-6", data.current_streak > 0 && "fill-warning/25")} strokeWidth={1.85} />
          </span>
          <p className="tabular mt-4 text-[4rem] leading-none font-semibold tracking-[-0.04em]">{data.current_streak}</p>
          <p className="mt-1 text-[0.9375rem] font-medium">day streak</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.logged_today ? "Today already counts. See you tomorrow." : data.current_streak > 0 ? "Log something today to keep it going." : "Log a transaction to start a new streak."}
          </p>
          <div className="mx-auto mt-6 flex max-w-xs justify-between gap-1.5">
            {data.week.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className={cn("flex size-8 items-center justify-center rounded-full border",
                  d.logged ? "border-transparent bg-primary text-primary-foreground" : "border-dashed border-muted-foreground/35")}>
                  {d.logged ? <Check className="size-3.5" strokeWidth={2.75} /> : null}
                </span>
                <span className="text-[0.6875rem] text-muted-foreground">{format(parseISO(d.date), "EEEEE")}</span>
              </div>
            ))}
          </div>
          <p className="tabular mt-5 text-[0.8125rem] text-muted-foreground">Best streak {data.best_streak} days, {data.logged_days_total} days tracked</p>
        </section>

        <div className="space-y-4 lg:space-y-5">
          <section className="card-surface flex items-center gap-4 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 className="section-title">Streak restores</h2>
              <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">Miss a single day this month and a restore keeps your streak alive. Restores reset monthly and don&apos;t roll over.</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular text-2xl leading-none font-semibold">{data.restores_left}</p>
              <p className="mt-1 text-xs text-muted-foreground">of {data.restores_per_month} left</p>
            </div>
          </section>

          {next && (
            <section className="card-surface flex items-center gap-4 p-4 sm:p-5">
              <BadgeMark badge={next} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] text-muted-foreground">Next badge</p>
                <h2 className="section-title">{next.name}</h2>
                <p className="tabular text-xs text-muted-foreground">{next.progress} done, {next.threshold - next.progress} to go</p>
                {next.threshold <= 14 ? (
                  <div className="mt-2 flex gap-1">
                    {Array.from({ length: next.threshold }).map((_, i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < next.progress ? "bg-primary" : "bg-muted")} />)}
                  </div>
                ) : (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(next.progress / next.threshold) * 100}%` }} /></div>
                )}
              </div>
            </section>
          )}

          <section className="card-surface flex items-center gap-4 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 className="section-title">Rewards</h2>
              <p className="text-[0.8125rem] text-muted-foreground">Unlock new Faldo poses and Home environments with your badges.</p>
              <p className="tabular mt-2 text-sm font-medium">{data.outfits.filter((o) => o.unlocked).length + data.backgrounds.filter((b) => b.unlocked).length} of {data.outfits.length + data.backgrounds.length} unlocked</p>
            </div>
            <Panda pose={poseFor(me?.settings.mascot_outfit)} sizes="80px" className="w-18" />
          </section>
        </div>
      </div>

      <section className="card-surface p-4 sm:p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="section-title">Badges</h2>
          <span className="tabular text-[0.8125rem] text-muted-foreground">{data.earned_count} of {data.badges.length} earned</span>
        </div>
        {[{ title: "Streaks", list: streakBadges }, { title: "Milestones", list: milestoneBadges }].map((group) => (
          <div key={group.title} className="mt-5">
            <p className="text-[0.8125rem] font-medium text-muted-foreground">{group.title}</p>
            <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-4 lg:grid-cols-8">
              {group.list.map((badge) => (
                <li key={badge.id} className="flex flex-col items-center text-center" title={badge.description}>
                  <BadgeMark badge={badge} />
                  <p className={cn("mt-2 text-xs font-medium", !badge.earned && "text-muted-foreground")}>{badge.name}</p>
                  <p className="text-[0.6875rem] leading-snug text-muted-foreground">{badge.group === "streak" ? `${badge.threshold} day${badge.threshold === 1 ? "" : "s"}` : badge.earned ? "Earned" : badge.description.replace(/\.$/, "")}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h2 className="section-title">Faldo poses</h2>
        <p className="text-[0.8125rem] text-muted-foreground">The pose you pick greets you on Home. Keep your streak going to unlock more.</p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.outfits.map((outfit) => {
            const info = OUTFIT_INFO[outfit.id] ?? { name: outfit.id, hint: "", pose: "bamboo" as const }
            const selected = me?.settings.mascot_outfit === outfit.id
            return (
              <li key={outfit.id}>
                <button type="button" onClick={() => wear("mascot_outfit", outfit.id, outfit.unlocked, info.hint)} aria-pressed={selected}
                  className={cn("pressable relative flex w-full flex-col items-center rounded-2xl bg-muted/50 p-3 text-center hover:bg-accent/70",
                    selected && "bg-secondary/70 shadow-[inset_0_0_0_1.5px_var(--primary)] hover:bg-secondary/70")}>
                  {selected && <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" strokeWidth={3} /></span>}
                  {!outfit.unlocked && <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-muted"><Lock className="size-3 text-muted-foreground" /></span>}
                  <span className="flex h-24 items-end justify-center"><Panda pose={info.pose} sizes="96px" muted={!outfit.unlocked} className="w-22" /></span>
                  <p className="mt-1 text-sm font-medium">{info.name}</p>
                  <p className="text-[0.6875rem] text-muted-foreground">{outfit.unlocked ? (selected ? "On Home" : "Tap to use") : info.hint}</p>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <h2 className="section-title">Home environments</h2>
        <p className="text-[0.8125rem] text-muted-foreground">Change the light in Faldo&apos;s green corner of your Home screen.</p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.backgrounds.map((bg) => {
            const info = BACKGROUND_INFO[bg.id] ?? BACKGROUND_INFO.meadow
            const selected = me?.settings.home_background === bg.id
            return (
              <li key={bg.id}>
                <button type="button" onClick={() => wear("home_background", bg.id, bg.unlocked, info.hint)} aria-pressed={selected}
                  className={cn("pressable w-full overflow-hidden rounded-2xl text-left shadow-[inset_0_0_0_1px_var(--border)]", selected && "ring-2 ring-primary/60")}>
                  <div className={cn("relative isolate h-20 overflow-hidden", !bg.unlocked && "opacity-40 grayscale")} style={environmentStyle(bg.id)}>
                    <BambooDecor className="absolute -right-4 -bottom-6 -z-10 h-32" />
                    {!bg.unlocked && <span className="absolute inset-0 flex items-center justify-center"><Lock className="size-5 text-white drop-shadow" /></span>}
                  </div>
                  <div className="bg-card px-3 py-2">
                    <p className="text-sm font-medium">{info.name}</p>
                    <p className="truncate text-[0.6875rem] text-muted-foreground">{bg.unlocked ? (selected ? "In use" : "Tap to use") : info.hint}</p>
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
