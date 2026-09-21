"use client"

import Link from "next/link"
import { ChevronRight, CircleCheck } from "lucide-react"
import { Panda } from "@/components/brand/panda"
import { ProgressBar } from "@/components/finance/progress-bar"
import { LargeTitle } from "@/components/ios/nav-header"
import { LESSONS } from "@/lib/lessons"
import { useMe } from "@/lib/queries"
import { cn } from "@/lib/utils"

const LEVELS = ["Foundations", "Growing", "Advanced"] as const

export default function LearnPage() {
  const { data: me } = useMe()
  const done = new Set(me?.settings.completed_lessons ?? [])
  const completed = LESSONS.filter((l) => done.has(l.slug)).length
  const nextLesson = LESSONS.find((l) => !done.has(l.slug))

  return (
    <div className="space-y-6">
      <LargeTitle title="Learn" subtitle="Short lessons on everyday money in the Philippines" back={{ href: "/you", label: "Profile" }} />

      <section className="card-surface overflow-hidden">
        <div className="flex items-center gap-4 p-4 sm:p-5">
          <Panda pose="boba" sizes="72px" className="w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="section-title">Faldo Coach</h2>
            <p className="tabular text-[0.8125rem] text-muted-foreground">{completed} of {LESSONS.length} lessons completed</p>
            <ProgressBar className="mt-2.5" value={(completed / LESSONS.length) * 100} label="Lessons completed" />
          </div>
        </div>
        {nextLesson ? (
          <Link href={`/learn/${nextLesson.slug}`} className="group flex items-center gap-3 border-t px-4 py-3.5 transition-colors hover:bg-accent/50 sm:px-5">
            <span className="text-[0.8125rem] text-muted-foreground">Up next</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{nextLesson.title}</span>
            <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : <p className="border-t px-4 py-3.5 text-sm font-medium text-primary sm:px-5">You finished every lesson.</p>}
      </section>

      {LEVELS.map((level) => {
        const lessons = LESSONS.filter((l) => l.level === level)
        return (
          <section key={level} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="section-title">{level}</h2>
              <span className="tabular text-[0.8125rem] text-muted-foreground">{lessons.filter((l) => done.has(l.slug)).length} of {lessons.length}</span>
            </div>
            <div className="ios-group divide-y divide-border/60">
              {lessons.map((lesson) => {
                const Icon = lesson.icon
                const finished = done.has(lesson.slug)
                return (
                  <Link key={lesson.slug} href={`/learn/${lesson.slug}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", finished ? "bg-secondary text-primary" : "bg-muted text-foreground/70")}>
                      <Icon className="size-4.5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem]">{lesson.title}</span>
                      <span className="line-clamp-1 text-[0.8125rem] text-muted-foreground">{lesson.summary}</span>
                    </span>
                    {finished ? <CircleCheck className="size-4.5 shrink-0 text-primary" strokeWidth={2} aria-label="Completed" /> : (
                      <span className="tabular shrink-0 text-[0.8125rem] text-muted-foreground">{lesson.minutes} min</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
      <p className="px-2 text-center text-xs text-muted-foreground">Lessons are for general education, not personal financial advice.</p>
    </div>
  )
}
