"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Panda } from "@/components/brand/panda"

/** The public Privacy and Terms pages: readable signed in or not, one plain column. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-5 pt-[calc(1.5rem+var(--top-inset))] pb-16">
      <article className="mx-auto max-w-[44rem] space-y-6">
        <Link href="/" className="inline-flex items-center gap-2" aria-label="Faldo home">
          <Panda pose="wave" sizes="48px" className="w-10" />
          <span className="font-brand text-2xl font-extrabold tracking-[-0.03em]">Faldo</span>
        </Link>
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.025em]">{title}</h1>
          <p className="text-sm text-muted-foreground">Draft of {updated}</p>
          <p role="note" className="rounded-2xl bg-warning-soft px-4 py-3 text-sm">
            This is a draft written from how Faldo works. It needs review by a qualified professional before it is relied
            on, and items in [brackets] still need to be filled in or confirmed. It is not legal advice.
          </p>
        </header>
        <div className="legal space-y-6 text-[0.9375rem] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-foreground/90 [&_ul]:space-y-1.5">
          {children}
        </div>
        <footer className="flex gap-4 border-t pt-6 text-sm text-muted-foreground">
          <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
          <Link href="/terms" className="underline underline-offset-2">Terms</Link>
          <Link href="/" className="underline underline-offset-2">Back to Faldo</Link>
        </footer>
      </article>
    </div>
  )
}

type Provider = { id: string; name: string; company: string; data_use: string; source: string }

/** Which outside AI service this Faldo is set up with right now, straight from the server (names only, never keys). */
export function AiProvidersNow() {
  const [state, setState] = useState<{ providers: Provider[]; sends: string } | null | "error">(null)
  useEffect(() => {
    fetch("/api/v1/ai/providers", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setState)
      .catch(() => setState("error"))
  }, [])
  if (state === null) return <p className="text-muted-foreground" role="status">Checking which AI service this Faldo uses…</p>
  if (state === "error") return <p>Faldo couldn&apos;t check which AI service it uses right now. Your in-app AI setting shows it too.</p>
  if (!state.providers.length) return <p>This Faldo doesn&apos;t send your data to an outside AI service. Its answers come from its own rules.</p>
  return (
    <>
      <p>This Faldo is set up to use: <strong>{state.providers.map((p) => p.name).join(", then ")}</strong>. When you allow it, Faldo sends: {state.sends}</p>
      <ul>
        {state.providers.map((p) => (
          <li key={p.id}>{p.name}: {p.data_use} <a href={p.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">{p.company}&apos;s terms</a></li>
        ))}
      </ul>
    </>
  )
}
