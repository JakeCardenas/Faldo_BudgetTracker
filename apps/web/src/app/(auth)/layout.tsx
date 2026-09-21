import { Calculator, ShieldCheck, Wallet } from "lucide-react"
import { Logo, MascotArt } from "@/components/brand/logo"

const HERO = {
  backgroundImage: [
    "radial-gradient(110% 80% at 100% 0%, rgb(255 255 255 / 0.14), transparent 55%)",
    "radial-gradient(80% 60% at 0% 100%, rgb(0 0 0 / 0.25), transparent 70%)",
    "linear-gradient(155deg, var(--hero), var(--hero-deep))",
  ].join(","),
}

const POINTS = [
  { icon: Wallet, text: "Safe to Spend from money you already have" },
  { icon: Calculator, text: "Every number shows the math behind it" },
  { icon: ShieldCheck, text: "Manual accounts. Never connects to your bank" },
]

/**
 * Sign-in, sign-up and password screens. Phones: a green header with the form on a sheet below it.
 * Desktop: the same green panel beside the form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6 lg:p-5">
      <aside className="relative isolate flex flex-col overflow-hidden px-6 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-14 text-white lg:rounded-[2rem] lg:p-12 lg:pb-12"
        style={HERO}>
        <Logo tone="light" />
        <div className="mt-6 flex items-end gap-4 lg:my-auto lg:max-w-md lg:flex-col lg:items-start lg:gap-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.625rem] leading-[1.15] font-semibold tracking-[-0.03em] text-balance-safe lg:mt-8 lg:text-[2.625rem] lg:leading-[1.08]">
              Know where your money went. Decide where it goes.
            </h2>
            <p className="mt-3 hidden max-w-sm text-[0.9375rem] leading-relaxed text-white/85 lg:block">
              A calm money companion for the Philippines. It works from your real transactions and shows its math.
            </p>
          </div>
          <MascotArt className="w-20 shrink-0 drop-shadow-[0_12px_24px_rgb(0_0_0/0.25)] lg:order-first lg:w-36" priority />
        </div>
        <ul className="mt-10 hidden space-y-3 lg:block">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-[0.9375rem] text-white/90">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/14"><Icon className="size-4" strokeWidth={1.9} /></span>
              {text}
            </li>
          ))}
        </ul>
      </aside>
      <main className="relative -mt-7 flex min-h-[calc(100dvh-13rem)] flex-col rounded-t-[1.75rem] bg-background px-5 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-10 lg:mt-0 lg:min-h-0 lg:rounded-none lg:bg-transparent lg:pt-8">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">{children}</div>
        <p className="mx-auto mt-8 max-w-sm text-center text-xs text-muted-foreground lg:hidden">Manual accounts only. Faldo never connects to your bank or e-wallet.</p>
      </main>
    </div>
  )
}
