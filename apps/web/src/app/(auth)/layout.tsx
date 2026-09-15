import { Logo, LogoMark, MascotArt } from "@/components/brand/logo"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col">
        <div className="absolute -top-40 -right-40 size-[32rem] rounded-full bg-emerald/25 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-leaf/15 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <LogoMark className="size-10" />
          <span className="text-lg font-extrabold tracking-tight">Faldo</span>
        </div>
        <MascotArt className="animate-bob relative mx-auto mt-10 w-56 drop-shadow-2xl xl:w-64" priority />
        <div className="relative mt-auto max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance-safe">Know where your money went. Decide where it goes.</h2>
            <p className="text-primary-foreground/70">An AI copilot that answers from your real transactions, and shows the math behind every number.</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.06] p-5 backdrop-blur">
            <p className="text-sm text-primary-foreground/70">“Can I afford ₱3,000 headphones?”</p>
            <p className="text-[0.95rem]">Yes. After the purchase, your balance is projected to stay above your safety buffer through month end.</p>
            <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
              {[["Balance", "₱24,850"], ["Bills", "−₱5,200"], ["Projected", "₱9,650"]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-primary-foreground/[0.07] p-2.5">
                  <p className="text-primary-foreground/60">{k}</p>
                  <p className="tabular font-medium">{v}</p>
                </div>
              ))}
            </div>
            <p className="text-[0.7rem] tracking-wide text-primary-foreground/50 uppercase">Illustration</p>
          </div>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex flex-col items-center gap-2 lg:hidden">
          <MascotArt className="animate-bob w-24" priority />
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  )
}
