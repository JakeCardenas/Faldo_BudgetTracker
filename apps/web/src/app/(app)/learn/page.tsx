"use client"

import Link from "next/link"
import { CheckCircle2, ChevronRight, Clock, Flame } from "lucide-react"
import { Mascot } from "@/components/brand/mascot"
import { LargeTitle } from "@/components/ios/nav-header"
import { LESSONS } from "@/lib/lessons"
import { useEngagement, useMe } from "@/lib/queries"
import { cn } from "@/lib/utils"

const LEVELS = ["Foundations", "Growing", "Advanced"] as const

export default function LearnPage() {
  const { data: me } = useMe()
  const { data: engagement } = useEngagement()
  const done = new Set(me?.settings.completed_lessons ?? [])
  const completed = LESSONS.filter((l) => done.has(l.slug)).length
  const nextLesson = LESSONS.find((l) => !done.has(l.slug))

  return (
    <div className="space-y-5">
      <LargeTitle title="Learn" subtitle="Simple lessons for everyday money." back={{ href: "/", label: "Home" }} />

      <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-hero to-hero-deep p-5 text-white shadow-(--shadow-float)">
        <div className="relative flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.66rem] font-bold tracking-[0.12em] text-white/70 uppercase">Financial literacy</p>
            <h2 className="text-2xl font-extrabold tracking-tight">Faldo Coach</h2>
            <p className="text-sm text-white/80">Bite-sized lessons written for money in the Philippines.</p>
          </div>
          <Mascot outfit="grad_cap" mood="proud" coin={false} className="w-24 shrink-0 drop-shadow-md" />
        </div>
        <div className="relative mt-4 space-y-3 rounded-2xl bg-card p-4 text-card-foreground">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-extrabold"><Flame className="size-4 fill-[#f28b30] text-[#e0772f]" /> {engagement?.current_streak ?? 0} day streak</span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{completed} of {LESSONS.length} done</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(completed / LESSONS.length) * 100}%` }} /></div>
          {nextLesson ? (
            <Link href={`/learn/${nextLesson.slug}`} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Up next:</span><span className="min-w-0 flex-1 truncate font-bold">{nextLesson.title}</span><ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ) : <p className="text-sm font-bold text-primary">You finished every lesson. Amazing!</p>}
        </div>
      </section>

      {LEVELS.map((level) => {
        const lessons = LESSONS.filter((l) => l.level === level)
        return (
          <section key={level} className="space-y-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-lg font-extrabold tracking-tight">{level}</h2>
              <span className="text-xs font-semibold text-muted-foreground">{lessons.filter((l) => done.has(l.slug)).length}/{lessons.length} completed</span>
            </div>
            <div className="ios-group divide-y divide-border/60">
              {lessons.map((lesson) => (
                <Link key={lesson.slug} href={`/learn/${lesson.slug}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60">
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl text-xl", done.has(lesson.slug) ? "bg-income-soft" : "bg-secondary")} aria-hidden>{lesson.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.95rem] font-bold">{lesson.title}</span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">{lesson.summary}</span>
                  </span>
                  {done.has(lesson.slug) ? <CheckCircle2 className="size-5 shrink-0 text-income" /> : (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground"><Clock className="size-3.5" />{lesson.minutes} min</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )
      })}
      <p className="px-2 text-center text-xs text-muted-foreground">Lessons are for general education, not personal financial advice.</p>
    </div>
  )
}
