"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AddTransactionDialog, type AddMode } from "@/widgets/add-transaction"
import Image from "next/image"
import { SplashContent } from "@/shared/ui/brand/splash"
import { FaldoCheckSheet } from "@/features/purchase-decision"
import { TransactionSheet } from "@/features/transaction-edit"
import { AppActionsContext, type AddModeOption, type CheckPreset, type EntryPreset } from "@/shared/lib/app-actions"
import { AddMenu } from "@/widgets/add-menu"
import { CommandSearch } from "@/widgets/command-search"
import { FaldoBubble } from "@/widgets/faldo-bubble"
import { MobileNav, TopNav } from "@/widgets/navigation"
import { Button } from "@/shared/ui/button"
import { useBubbleShown } from "@/shared/lib/bubble"
import { setDisplayCurrency } from "@/shared/lib/currency"
import { useAmountsHidden } from "@/shared/lib/privacy"
import { useSmoothTheme } from "@/shared/lib/theme"
import { useMe } from "@/entities/session"
import { play } from "@/shared/lib/sound"
import type { Receipt } from "@/shared/api/types"
import { cn } from "@/shared/lib/utils"

const ADD_MODES: AddModeOption[] = ["expense", "income", "transfer", "describe", "manual", "receipt"]
const WelcomeSplash = dynamic(() => import("@/shared/ui/brand/welcome-splash"), { ssr: false })

const visited = new Set<string>()

/**
 * Pages that are one list or one form. On desktop they keep a reading width (48rem, centred) instead of stretching to
 * the full 1240px, where a name and its amount would sit a screen apart. Pages with two columns (Home, Wallet, Plan,
 * Statistics, Forecast, Budgets) use the full width.
 */
const NARROW = ["/transactions", "/insights", "/bills", "/debts", "/goals", "/learn", "/tools", "/settings", "/plan/money", "/plan/purchases", "/import"]
const isNarrow = (pathname: string) => NARROW.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/** The page area. The first visit to a page plays the full entrance; coming back to it is a quick fade. */
function PageMain({ pathname, className, children }: { pathname: string; className: string; children: React.ReactNode }) {
  const [firstVisit] = useState(() => !visited.has(pathname))
  useEffect(() => { visited.add(pathname) }, [pathname])
  return <main id="main" className={cn(className, firstVisit ? "page-enter" : "page-return")}>{children}</main>
}

/**
 * Shown instead of the launch splash when Faldo can't load who's signed in (the server is down, or the phone lost its
 * connection). Without it the splash would wait forever with no word about why. A 401 never gets here: it goes to Log in.
 */
function Unreachable({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Image src="/brand/faldo-panda-512.png" alt="" width={56} height={56} priority unoptimized className="size-14" />
      <div className="max-w-xs space-y-1.5">
        <h1 className="text-lg font-semibold">Faldo can&apos;t reach its server</h1>
        <p className="text-sm text-muted-foreground">Check your connection, then try again. Nothing you saved is lost.</p>
      </div>
      <Button onClick={onRetry} disabled={retrying}>{retrying && <Loader2 className="animate-spin" />} Try again</Button>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: me, isLoading, isError, isFetching, refetch } = useMe()
  // Re-renders the shell's own sheets and dialogs when "Hide amounts" changes; pages subscribe themselves.
  useAmountsHidden()
  const bubble = useBubbleShown()
  const { setTheme } = useSmoothTheme()
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>("expense")
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [preset, setPreset] = useState<EntryPreset | undefined>()
  const [text, setText] = useState<string | undefined>()
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [checkOpen, setCheckOpen] = useState(false)
  const [checkPreset, setCheckPreset] = useState<CheckPreset | undefined>()
  const theme = me?.settings.theme
  // Every amount on every screen shows in this person's currency (lib/currency), set before any page draws.
  if (me && typeof window !== "undefined") setDisplayCurrency(me.settings.currency)

  useEffect(() => {
    if (me && !me.settings.onboarding_completed_at) router.replace("/onboarding")
  }, [me, router])

  useEffect(() => {
    if (theme) setTheme(theme)
  }, [theme, setTheme])

  const openAddTransaction = useCallback((options?: { mode?: AddModeOption; receipt?: Receipt; preset?: EntryPreset; text?: string }) => {
    setReceipt(options?.receipt ?? null)
    setPreset(options?.preset)
    setText(options?.text)
    setAddMode(options?.receipt ? "receipt" : options?.mode ?? "expense")
    setAddOpen(true)
    play("open")
  }, [])

  useEffect(() => {
    if (!me?.settings.onboarding_completed_at) return
    const params = new URLSearchParams(window.location.search)
    const add = params.get("add") as AddModeOption | null
    if (!add || !ADD_MODES.includes(add)) return
    params.delete("add")
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`)
    const timer = setTimeout(() => openAddTransaction({ mode: add }), 0)
    return () => clearTimeout(timer)
  }, [me, openAddTransaction, pathname, router])

  // Google or Apple just took this account back from a password nobody had confirmed (see services/oauth.py).
  useEffect(() => {
    // Not onboarded yet: onboarding's own redirect wins, and a first-time account has nothing to explain.
    if (!me?.settings.onboarding_completed_at) return
    const params = new URLSearchParams(window.location.search)
    if (params.get("notice") !== "account-secured") return
    params.delete("notice")
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`)
    toast("We secured your account", {
      description: "This email had a password that was never confirmed, so we turned it off and signed out every other "
        + "device. Your records are all here. You can set a new password in Settings.",
      duration: Infinity,
      action: { label: "Settings", onClick: () => router.push("/settings/security") },
    })
  }, [me, pathname, router])

  const actions = useMemo(() => ({
    openAddTransaction,
    openAddMenu: () => { play("open"); setMenuOpen(true) },
    openSearch: () => setSearchOpen(true),
    openTransaction: (id: string) => setTransactionId(id),
    openCheck: (preset?: CheckPreset) => { setCheckPreset(preset); setCheckOpen(true); play("open") },
  }), [openAddTransaction])

  const booting = isLoading || !me || !me.settings.onboarding_completed_at
  const fullBleed = pathname.startsWith("/assistant")

  return (
    <>
      <WelcomeSplash />
      {isError && !me ? (
        <Unreachable retrying={isFetching} onRetry={() => void refetch()} />
      ) : booting ? (
        <>
          <SplashContent className="boot-full min-h-dvh" />
          <div className="boot-quiet flex min-h-dvh items-center justify-center">
            <Image src="/brand/faldo-panda-512.png" alt="" width={56} height={56} priority unoptimized className="size-14 animate-pulse" />
          </div>
        </>
      ) : (
        <AppActionsContext.Provider value={actions}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow-(--shadow-float)">Skip to content</a>
          {/* The app paints its own canvas, so the body's colour only shows under the status bar and in overscroll. */}
          <div className="flex min-h-dvh flex-col bg-background">
            {!fullBleed && <TopNav />}
            <PageMain key={pathname} pathname={pathname} className={fullBleed
              ? "w-full flex-1"
              // With the Faldo bubble docked above the tab bar, the page scrolls far enough for its last row to clear it.
              : cn("mx-auto w-full max-w-[1240px] flex-1 px-5 sm:px-6 lg:px-8 lg:pb-20", isNarrow(pathname) && "lg:max-w-[52rem]",
                bubble ? "pb-[calc(9.5rem+env(safe-area-inset-bottom))]" : "pb-[calc(6.5rem+env(safe-area-inset-bottom))]")}>
              {children}
            </PageMain>
          </div>
          <MobileNav />
          <FaldoBubble />
          <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} mode={addMode} onModeChange={setAddMode} receipt={receipt} preset={preset} text={text} />
          <AddMenu open={menuOpen} onOpenChange={setMenuOpen} />
          <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} onAddTransaction={() => openAddTransaction()} onOpenTransaction={setTransactionId} />
          <TransactionSheet id={transactionId} onOpenChange={(open) => { if (!open) setTransactionId(null) }} />
          <FaldoCheckSheet open={checkOpen} onOpenChange={setCheckOpen} preset={checkPreset} />
        </AppActionsContext.Provider>
      )}
    </>
  )
}
