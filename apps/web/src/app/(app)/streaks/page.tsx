"use client"

import { format, parseISO } from "date-fns"
import { Check, Flame, Lock } from "lucide-react"
import { toast } from "sonner"
import { Panda } from "@/components/brand/panda"
import { ChallengesSection } from "@/components/challenges/challenges-section"
import { LargeTitle } from "@/components/ios/nav-header"
import { Skeleton } from "@/components/ui/skeleton"
import { OUTFIT_INFO, poseFor } from "@/lib/catalog"
import { useMaskedAmounts } from "@/lib/privacy"
import { useEngagement, useMe, useUpdateSettings } from "@/lib/queries"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

export default function StreaksPage() {
  useMaskedAmounts()
  const { data: me } = useMe()
  const { data, isLoading } = useEngagement()
  const update = useUpdateSettings()

  function wear(id: string, unlocked: boolean, hint: string) {
    if (!unlocked) { play("disabled"); toast(`Locked. ${hint}`); return }
    update.mutate({ mascot_outfit: id }, {
      onSuccess: () => { play("celebrate"); toast("Faldo's pose updated on Home") },
      onError: (e) => toast.error(e.message),
    })
  }

  if (isLoading || !data) {
    return <div className="space-y-4"><LargeTitle title="Streaks" back={{ href: "/you", label: "Profile" }} /><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>
  }

  const next = data.outfits.find((o) => !o.unlocked)
  const nextInfo = next && OUTFIT_INFO[next.id]
  const unlocked = data.outfits.filter((o) => o.unlocked).length

  return (
    <div className="space-y-5">
      <LargeTitle title="Streaks" subtitle="Log a little every day to build the habit and unlock Faldo's poses" back={{ href: "/you", label: "Profile" }} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.1fr_1fr] lg:gap-5">
        <section className="card-surface px-5 py-7 text-center sm:py-8">
          <span className={cn("mx-auto flex size-12 items-center justify-center rounded-xl", data.current_streak > 0 ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
            <Flame className={cn("size-6", data.current_streak > 0 && "fill-warning/25")} strokeWidth={2} />
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

          <section className="card-surface flex items-center gap-4 p-4 sm:p-5">
            {next && nextInfo ? (
              <>
                <Panda pose={nextInfo.pose} sizes="80px" muted className="w-18 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem] text-muted-foreground">Next pose</p>
                  <h2 className="section-title">{nextInfo.name}</h2>
                  <p className="tabular text-xs text-muted-foreground">
                    {nextInfo.hint}{next.target > 1 ? `: ${next.progress} done, ${next.target - next.progress} to go` : ""}
                  </p>
                  {next.target > 1 && (next.target <= 14 ? (
                    <div className="mt-2 flex gap-1">
                      {Array.from({ length: next.target }).map((_, i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < next.progress ? "bg-primary" : "bg-muted")} />)}
                    </div>
                  ) : (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(next.progress / next.target) * 100}%` }} /></div>
                  ))}
                  <p className="tabular mt-2 text-[0.8125rem] text-muted-foreground">{unlocked} of {data.outfits.length} poses unlocked</p>
                </div>
              </>
            ) : (
              <>
                <Panda pose={poseFor(me?.settings.mascot_outfit)} sizes="80px" className="w-18 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="section-title">Every pose unlocked</h2>
                  <p className="text-[0.8125rem] text-muted-foreground">All {data.outfits.length} of Faldo&apos;s poses are yours. Pick one below.</p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <ChallengesSection />

      <section className="card-surface p-4 sm:p-5">
        <h2 className="section-title">Faldo poses</h2>
        <p className="text-[0.8125rem] text-muted-foreground">The pose you pick greets you on Home. Keep going to unlock more.</p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.outfits.map((outfit) => {
            const info = OUTFIT_INFO[outfit.id] ?? { name: outfit.id, hint: "", pose: "bamboo" as const }
            const selected = me?.settings.mascot_outfit === outfit.id
            return (
              <li key={outfit.id}>
                <button type="button" onClick={() => wear(outfit.id, outfit.unlocked, info.hint)} aria-pressed={selected}
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
    </div>
  )
}
