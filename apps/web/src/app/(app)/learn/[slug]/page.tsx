"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { use, useState } from "react"
import { ArrowRight, CheckCircle2, Clock, Lightbulb, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Mascot } from "@/components/brand/mascot"
import { LargeTitle } from "@/components/ios/nav-header"
import { LESSONS, lessonBySlug } from "@/lib/lessons"
import { useMe, useUpdateSettings } from "@/lib/queries"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

export default function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
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
      onSuccess: () => { play("celebrate"); toast("Lesson complete! 🎓") },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <LargeTitle title={lesson.title} subtitle={<span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {lesson.minutes} min read · {lesson.level}</span>} back={{ href: "/learn", label: "Learn" }} />

      <div className="flex items-end gap-2">
        <Mascot outfit="grad_cap" coin={false} className="w-16 shrink-0" />
        <p className="mb-2 flex-1 rounded-[1.4rem] rounded-bl-md border bg-card px-4 py-3 text-[0.95rem] shadow-(--shadow-card)">
          <span className="mr-1" aria-hidden>{lesson.emoji}</span>{lesson.summary}
        </p>
      </div>

      {lesson.sections.map((section) => (
        <section key={section.heading} className="card-surface space-y-2 p-5">
          <h2 className="text-lg font-extrabold tracking-tight">{section.heading}</h2>
          {section.body.map((paragraph, i) => <p key={i} className="text-[0.95rem] leading-relaxed text-foreground/90">{paragraph}</p>)}
        </section>
      ))}

      <section className="rounded-[1.5rem] bg-secondary p-5">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-secondary-foreground"><Lightbulb className="size-4.5" /> Key takeaways</h2>
        <ul className="mt-2 space-y-1.5">
          {lesson.takeaways.map((t) => <li key={t} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{t}</li>)}
        </ul>
      </section>

      <section className="card-surface space-y-3 p-5">
        <p className="eyebrow text-primary">Quick check</p>
        <h2 className="text-base font-extrabold">{lesson.quiz.question}</h2>
        <div className="space-y-2">
          {lesson.quiz.options.map((option, i) => {
            const picked = choice === i
            const show = choice !== null
            return (
              <button key={option} type="button" disabled={show} onClick={() => { play(i === lesson.quiz.answer ? "success" : "error"); setChoice(i) }}
                className={cn("pressable flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left text-sm font-semibold transition-colors",
                  show && i === lesson.quiz.answer && "border-income bg-income-soft",
                  show && picked && i !== lesson.quiz.answer && "border-expense bg-expense-soft")}>
                <span className="flex-1">{option}</span>
                {show && i === lesson.quiz.answer && <CheckCircle2 className="size-5 text-income" />}
                {show && picked && i !== lesson.quiz.answer && <XCircle className="size-5 text-expense" />}
              </button>
            )
          })}
        </div>
        {choice !== null && (
          <p className={cn("rounded-2xl px-4 py-3 text-sm", correct ? "bg-income-soft" : "bg-muted")}>
            <span className="font-extrabold">{correct ? "Correct! " : "Not quite. "}</span>{lesson.quiz.explanation}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        {isDone ? (
          <p className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-income-soft text-sm font-bold text-income"><CheckCircle2 className="size-4" /> Completed</p>
        ) : (
          <button type="button" onClick={complete} disabled={update.isPending || choice === null}
            className="pressable h-12 flex-1 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
            {choice === null ? "Answer the quick check to finish" : "Mark lesson complete"}
          </button>
        )}
        {lesson.tryIt && (
          <Link href={lesson.tryIt.href} className="pressable flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl border bg-card text-sm font-bold text-primary">
            {lesson.tryIt.label} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      {next && (
        <Link href={`/learn/${next.slug}`} className="card-surface pressable flex items-center gap-3 p-4">
          <span className="text-xl" aria-hidden>{next.emoji}</span>
          <span className="min-w-0 flex-1"><span className="eyebrow block">Next lesson</span><span className="block truncate font-bold">{next.title}</span></span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      )}
    </article>
  )
}
