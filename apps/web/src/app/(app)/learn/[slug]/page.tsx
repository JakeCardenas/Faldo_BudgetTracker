"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { use, useState } from "react"
import { ArrowRight, CheckCircle2, CircleCheck, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { LargeTitle } from "@/components/ios/nav-header"
import { LESSONS, lessonBySlug } from "@/lib/lessons"
import { useMaskedAmounts } from "@/lib/privacy"
import { useMe, useUpdateSettings } from "@/lib/queries"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

export default function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  useMaskedAmounts()
  const { slug } = use(params)
  const lesson = lessonBySlug(slug)
  const { data: me } = useMe()
  const update = useUpdateSettings()
  const [choice, setChoice] = useState<number | null>(null)
  if (!lesson) notFound()

  const done = me?.settings.completed_lessons ?? []
  const isDone = done.includes(lesson.slug)
  const index = LESSONS.findIndex((l) => l.slug === lesson.slug)
  const next = LESSONS[index + 1]
  const correct = choice === lesson.quiz.answer

  function complete() {
    update.mutate({ completed_lessons: [...done, lesson!.slug] }, {
      onSuccess: () => { play("celebrate"); toast.success("Lesson complete") },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <LargeTitle title={lesson.title} subtitle={`${lesson.level}, ${lesson.minutes} min read`} back={{ href: "/learn", label: "Learn" }} />

      <p className="text-[1.0625rem] leading-relaxed text-foreground/85">{lesson.summary}</p>

      {lesson.sections.map((section) => (
        <section key={section.heading} className="space-y-2.5 border-t pt-5">
          <h2 className="text-lg font-semibold tracking-[-0.015em]">{section.heading}</h2>
          {section.body.map((paragraph, i) => <p key={i} className="text-[0.9375rem] leading-[1.7] text-foreground/85">{paragraph}</p>)}
        </section>
      ))}

      <section className="card-surface p-5">
        <h2 className="section-title">Key takeaways</h2>
        <ul className="mt-3 space-y-2">
          {lesson.takeaways.map((t) => <li key={t} className="flex gap-2.5 text-sm leading-relaxed"><CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2} />{t}</li>)}
        </ul>
      </section>

      <section className="card-surface space-y-3 p-5">
        <p className="text-[0.8125rem] font-medium text-muted-foreground">Quick check</p>
        <h2 className="section-title">{lesson.quiz.question}</h2>
        <div className="space-y-2">
          {lesson.quiz.options.map((option, i) => {
            const picked = choice === i
            const show = choice !== null
            return (
              <button key={option} type="button" disabled={show} onClick={() => { play(i === lesson.quiz.answer ? "success" : "error"); setChoice(i) }}
                className={cn("pressable flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left text-sm enabled:hover:bg-accent/60 disabled:cursor-default",
                  show && i === lesson.quiz.answer && "border-income/50 bg-income-soft",
                  show && picked && i !== lesson.quiz.answer && "border-expense/50 bg-expense-soft")}>
                <span className="flex-1">{option}</span>
                {show && i === lesson.quiz.answer && <CheckCircle2 className="size-5 text-income" />}
                {show && picked && i !== lesson.quiz.answer && <XCircle className="size-5 text-expense" />}
              </button>
            )
          })}
        </div>
        {choice !== null && (
          <p className="animate-rise rounded-lg bg-muted/60 px-4 py-3 text-sm leading-relaxed">
            <span className={cn("font-medium", correct ? "text-income" : "text-foreground")}>{correct ? "Correct. " : "Not quite. "}</span>{lesson.quiz.explanation}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        {isDone ? (
          <p className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary text-sm font-medium text-secondary-foreground"><CheckCircle2 className="size-4" /> Completed</p>
        ) : (
          <Button size="lg" className="flex-1" onClick={complete} disabled={update.isPending || choice === null}>
            {choice === null ? "Answer the quick check to finish" : "Mark lesson complete"}
          </Button>
        )}
        {lesson.tryIt && (
          <Button size="lg" variant="outline" className="flex-1" asChild>
            <Link href={lesson.tryIt.href}>{lesson.tryIt.label} <ArrowRight className="text-muted-foreground" /></Link>
          </Button>
        )}
      </div>
      {next && (
        <Link href={`/learn/${next.slug}`} className="card-surface group flex items-center gap-3 p-4 transition-colors hover:border-input">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70"><next.icon className="size-4.5" strokeWidth={2} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[0.8125rem] text-muted-foreground">Next lesson</span><span className="block truncate text-[0.9375rem] font-medium">{next.title}</span></span>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </article>
  )
}
