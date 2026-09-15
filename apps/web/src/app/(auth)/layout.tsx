import { Logo, MascotArt } from "@/components/brand/logo"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1fr_1fr]">
      <aside className="relative hidden flex-col border-r bg-card p-10 lg:flex xl:p-12">
        <Logo />
        <div className="my-auto max-w-md">
          <MascotArt className="w-40 xl:w-44" priority />
          <h2 className="mt-8 text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance-safe">Know where your money went. Decide where it goes.</h2>
          <p className="mt-4 max-w-sm leading-relaxed text-muted-foreground">A money companion that answers from your real transactions and shows the math behind every number.</p>
        </div>
        <p className="text-xs text-muted-foreground">Manual accounts only. Faldo never connects to your bank or e-wallet.</p>
      </aside>
      <main className="flex flex-col px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-8 sm:px-10">
        <div className="flex items-center justify-center lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  )
}
