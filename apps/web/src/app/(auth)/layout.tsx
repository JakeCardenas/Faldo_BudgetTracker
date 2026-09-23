import { Calculator, ShieldCheck, Wallet } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { LIGHT_ENVIRONMENT } from "@/components/brand/environment"
import { BambooDecor } from "@/components/brand/scenery"
import { Panda } from "@/components/brand/panda"

const POINTS = [
  { icon: Wallet, text: "Safe to Spend from money you already have" },
  { icon: Calculator, text: "Every number shows the math behind it" },
  { icon: ShieldCheck, text: "Manual accounts. Never connects to your bank" },
]

/**
 * Sign-in, sign-up and password screens. Phones: Faldo's light environment as a header that melts into
 * the form below. Desktop: the same environment as a panel beside the form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6 lg:p-5">
      <aside className="faldo-env relative isolate flex flex-col overflow-hidden px-6 pt-[calc(1.25rem+var(--top-inset))] pb-6 lg:rounded-[2rem] lg:p-12"
        style={LIGHT_ENVIRONMENT}>
        <BambooDecor tone="onLight" className="absolute -right-4 bottom-0 -z-10 hidden h-[34rem] w-44 lg:block" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-16 bg-linear-to-b from-transparent to-background lg:hidden" />
        <Logo />
        <div className="mt-6 flex items-end gap-4 lg:my-auto lg:max-w-md lg:flex-col lg:items-start lg:gap-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.625rem] leading-[1.15] font-semibold tracking-[-0.03em] text-balance-safe lg:mt-8 lg:text-[2.625rem] lg:leading-[1.08]">
              Know where your money went. Decide where it goes.
            </h2>
            <p className="mt-3 hidden max-w-sm text-[0.9375rem] leading-relaxed text-muted-foreground lg:block">
              A calm money companion for the Philippines. It works from your real transactions and shows its math.
            </p>
          </div>
          <Panda pose="wave" priority sizes="(min-width: 1024px) 208px, 120px" className="w-[6.75rem] shrink-0 min-[390px]:w-28 lg:order-first lg:w-52" />
        </div>
        <ul className="mt-10 hidden space-y-3 lg:block">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-[0.9375rem]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card/80 text-primary ring-1 ring-foreground/[0.05]"><Icon className="size-4" strokeWidth={2} /></span>
              {text}
            </li>
          ))}
        </ul>
      </aside>
      <main className="relative flex min-h-[calc(100dvh-13rem)] flex-col px-5 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-10 lg:min-h-0 lg:pt-8">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">{children}</div>
        <p className="mx-auto mt-8 max-w-sm text-center text-xs text-muted-foreground lg:hidden">Manual accounts only. Faldo never connects to your bank or e-wallet.</p>
      </main>
    </div>
  )
}
