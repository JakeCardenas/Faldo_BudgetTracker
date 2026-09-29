import { Logo } from "@/components/brand/logo"
import { Panda } from "@/components/brand/panda"

/**
 * Sign-in, sign-up and password screens: one calm column on white, the same on every screen size. Faldo's name at
 * the top, Faldo waving under it, then the form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-card px-6 pt-[calc(1.25rem+var(--top-inset))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:bg-background">
      <div className="mx-auto flex w-full max-w-[24rem] flex-1 flex-col sm:justify-center">
        <div className="sm:rounded-[2rem] sm:bg-card sm:px-8 sm:pt-9 sm:pb-8 sm:shadow-(--shadow-card)">
          <header className="flex flex-col items-center">
            <Logo />
            <Panda pose="wave" priority sizes="120px" className="mt-5 w-[6.5rem] min-[390px]:w-28" />
          </header>
          <main className="mt-4">{children}</main>
        </div>
      </div>
    </div>
  )
}
