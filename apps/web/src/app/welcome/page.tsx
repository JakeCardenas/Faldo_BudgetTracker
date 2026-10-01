import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { CalendarClock, MessageCircleQuestion, PiggyBank, ShieldCheck, Wallet } from "lucide-react"
import { DemoEndedNotice } from "./notice"
import { PILL, PRIMARY_PILL, TryDemo } from "@/features/auth"
import { Panda } from "@/shared/ui/brand/panda"
import { cn } from "@/shared/lib/utils"

export const metadata: Metadata = {
  title: "Know where it went. Decide where it goes.",
  description: "Faldo shows what's safe to spend until your next income and what a purchase would do before you make it.",
  alternates: { canonical: "/welcome" },
}

// The worked example. Made-up numbers, labelled as such where they're shown: 16,000 − 4,200 − 2,000 − 2,000 = 7,800,
// over 10 days until the next income.
const EXAMPLE = [
  { label: "Money you have now", amount: "₱16,000", note: "Cash, e-wallets and bank accounts you mark spendable" },
  { label: "Bills before your next income", amount: "−₱4,200" },
  { label: "Planned savings for your goals", amount: "−₱2,000" },
  { label: "Safety buffer", amount: "−₱2,000", note: "Kept aside for surprises. You choose how much" },
]

const SECONDARY_PILL = cn(PILL, "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent")

/**
 * The start page for anyone signed out who opens Faldo (src/proxy.ts sends "/" here): what Safe to Spend and Faldo
 * Check are, a worked example with numbers labelled as made up, and the ways in: create an account, try the demo in a
 * sandbox of your own (when the server has it on), or log in.
 */
export default function WelcomePage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-[66rem] items-center justify-between gap-4 px-5 pt-[calc(0.75rem+var(--top-inset))] sm:px-8">
        <Link href="/welcome" className="flex items-center gap-2" aria-label="Faldo">
          <Panda pose="wave" priority sizes="48px" className="w-10" />
          <span className="font-brand text-[1.625rem] font-extrabold tracking-[-0.03em]">Faldo</span>
        </Link>
        <Link href="/login" className="pressable flex h-11 items-center rounded-full px-4 text-[0.9375rem] font-semibold hover:bg-accent">Log in</Link>
      </header>

      <main className="mx-auto max-w-[66rem] px-5 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:px-8">
        <Suspense><DemoEndedNotice /></Suspense>

        <section className="grid items-center gap-10 pt-8 pb-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pt-16 lg:pb-20">
          <div className="space-y-6 text-center lg:text-left">
            <h1 className="text-[2.375rem] leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-[3.25rem]">
              Know where it went. Decide where it goes.
            </h1>
            <p className="mx-auto max-w-[34rem] text-[1.0625rem] leading-relaxed text-muted-foreground lg:mx-0">
              Faldo is a money companion for everyday spending. Write down what you spend the way you&apos;d text it, see
              what&apos;s safe to spend until your next income, and check a purchase before you make it.
            </p>
            <div className="mx-auto flex max-w-[24rem] flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
              <Link href="/register" className={cn(PRIMARY_PILL, "sm:w-auto sm:px-7")}>Create an account</Link>
              <TryDemo className={cn(SECONDARY_PILL, "sm:w-auto sm:px-7")} errorClassName="sm:basis-full"
                hint={<p className="text-[0.8125rem] text-muted-foreground sm:basis-full">No sign-up. Your own copy with sample data, deleted within a day.</p>}>
                Try the demo
              </TryDemo>
            </div>
          </div>

          <figure className="mx-auto w-full max-w-[26rem] rounded-[1.75rem] bg-card p-5 shadow-(--shadow-card) sm:p-6" aria-labelledby="example-title">
            <figcaption className="flex items-center justify-between gap-3">
              <span id="example-title" className="text-[0.9375rem] font-semibold">Safe to spend</span>
              <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[0.6875rem] font-semibold">Example · made-up numbers</span>
            </figcaption>
            <p className="mt-3 font-money text-[2.5rem] leading-none font-extrabold tracking-[-0.022em] tabular-nums">₱7,800</p>
            <p className="mt-1.5 text-sm text-muted-foreground">About ₱780 a day for the 10 days until payday</p>
            <dl className="mt-5 divide-y divide-border/70 border-t border-border/70 text-sm">
              {EXAMPLE.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="min-w-0">
                    {row.label}
                    {row.note && <span className="block text-xs text-muted-foreground">{row.note}</span>}
                  </dt>
                  <dd className="shrink-0 font-semibold tabular-nums">{row.amount}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 pt-2.5 font-semibold">
                <dt>Safe to spend</dt>
                <dd className="text-primary tabular-nums">₱7,800</dd>
              </div>
            </dl>
          </figure>
        </section>

        <section aria-labelledby="how-title" className="border-t border-border/70 py-12 lg:py-16">
          <h2 id="how-title" className="text-[1.625rem] leading-tight font-bold tracking-[-0.025em] sm:text-3xl">How Safe to Spend works</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            <Point icon={Wallet} title="Only money you already have">
              Income you&apos;re expecting is never counted. It only sets how long your money has to last.
            </Point>
            <Point icon={CalendarClock} title="What's spoken for comes first">
              Bills, money you owe and planned savings due before your next income are set aside, plus a safety buffer.
            </Point>
            <Point icon={PiggyBank} title="The rest, paced to payday">
              What&apos;s left is safe to spend, with a daily and weekly pace so the days before payday aren&apos;t the hardest.
            </Point>
          </ul>
        </section>

        <section aria-labelledby="check-title" className="grid items-center gap-8 border-t border-border/70 py-12 lg:grid-cols-2 lg:py-16">
          <div className="space-y-3">
            <h2 id="check-title" className="text-[1.625rem] leading-tight font-bold tracking-[-0.025em] sm:text-3xl">Check before you buy</h2>
            <p className="text-[1.0625rem] leading-relaxed text-muted-foreground">
              Faldo Check shows what a purchase would do to your Safe to Spend, this week&apos;s pace, a budget and your
              goals, from your own numbers. You decide; Faldo shows the impact.
            </p>
          </div>
          <ul className="space-y-2.5" aria-label="Questions you can ask Faldo">
            {["Can I afford a ₱3,000 purchase?", "Where did my money go this month?", "When will I reach my goal?"].map((q) => (
              <li key={q} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-[0.9375rem] shadow-(--shadow-card)">
                <MessageCircleQuestion className="size-5 shrink-0 text-primary" aria-hidden />
                {q}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="data-title" className="border-t border-border/70 py-12 lg:py-16">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-6 text-primary" aria-hidden />
            <h2 id="data-title" className="text-[1.625rem] leading-tight font-bold tracking-[-0.025em] sm:text-3xl">Your records stay yours</h2>
          </div>
          <ul className="mt-5 grid gap-x-8 gap-y-2.5 text-[0.9375rem] sm:grid-cols-2 [&>li]:flex [&>li]:gap-2.5 [&>li]:before:mt-2 [&>li]:before:size-1.5 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:bg-primary [&>li]:before:content-['']">
            <li>Faldo doesn&apos;t connect to your bank or ask for bank passwords. You add what you choose.</li>
            <li>No ads and no tracking tools.</li>
            <li>AI help only if you allow it, and Faldo&apos;s numbers always come from its own calculations.</li>
            <li>Download your data or delete your account at any time.</li>
          </ul>
          <p className="mt-5 text-sm text-muted-foreground">
            Details are in the <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">Privacy notice</Link>.
          </p>
        </section>

        <section className="flex flex-col items-center gap-5 rounded-[1.75rem] bg-hero px-6 py-10 text-center text-white sm:py-12">
          <Panda pose="bamboo" sizes="120px" className="w-24" />
          <h2 className="text-[1.625rem] leading-tight font-bold tracking-[-0.025em] text-balance sm:text-3xl">Start with what you have today</h2>
          <div className="flex w-full max-w-[24rem] flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Link href="/register" className={cn(PILL, "bg-white text-[#2f6a3b] hover:bg-white/90 sm:w-auto sm:px-7")}>Create an account</Link>
            <Link href="/login" className={cn(PILL, "text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.6)] hover:bg-white/10 sm:w-auto sm:px-7")}>Log in</Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[66rem] justify-center gap-5 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-sm text-muted-foreground sm:px-8">
        <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
        <Link href="/terms" className="underline underline-offset-2">Terms</Link>
      </footer>
    </div>
  )
}

function Point({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl bg-card p-5 shadow-(--shadow-card)">
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Icon className="size-5" /></span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">{children}</p>
    </li>
  )
}
