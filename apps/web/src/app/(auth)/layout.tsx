import { AuthDraftProvider } from "@/components/auth/draft"
import { Panda } from "@/components/brand/panda"

/**
 * Sign-in, sign-up and password screens: one calm column on white, the same on every screen size. Faldo waving beside
 * its name at the top, then the form; side by side keeps the form high enough to stay above a phone's keyboard.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-card px-6 pt-[calc(1.25rem+var(--top-inset))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:bg-background">
      <div className="mx-auto flex w-full max-w-[24rem] flex-1 flex-col sm:justify-center">
        <div className="sm:rounded-[2rem] sm:bg-card sm:px-8 sm:pt-9 sm:pb-8 sm:shadow-(--shadow-card)">
          <header className="flex items-center justify-center gap-2.5">
            <Panda pose="wave" priority sizes="96px" className="w-[4.75rem] min-[390px]:w-[5.25rem]" />
            <p className="font-brand text-[2.5rem] leading-none font-extrabold tracking-[-0.035em] min-[390px]:text-[2.75rem]">Faldo</p>
          </header>
          <main className="mt-7"><AuthDraftProvider>{children}</AuthDraftProvider></main>
        </div>
      </div>
    </div>
  )
}
