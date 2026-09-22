"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter } from "next/navigation"
import { AddTransactionDialog, type AddMode } from "@/components/capture/add-transaction-dialog"
import type { EntryPreset } from "@/components/capture/keypad-entry"
import Image from "next/image"
import { SplashContent } from "@/components/brand/splash"
import { FaldoCheckSheet, type CheckPreset } from "@/components/decide/faldo-check"
import { TransactionSheet } from "@/components/finance/transaction-sheet"
import { AppActionsContext, type AddModeOption } from "@/components/layout/app-context"
import { AddMenu } from "@/components/layout/add-menu"
import { CommandSearch } from "@/components/layout/command-search"
import { MobileNav } from "@/components/layout/mobile-nav"
import { TopNav } from "@/components/layout/top-nav"
import { useAmountsHidden } from "@/lib/privacy"
import { useSmoothTheme } from "@/lib/theme"
import { useMe } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Receipt } from "@/lib/types"
import { cn } from "@/lib/utils"

const ADD_MODES: AddModeOption[] = ["expense", "income", "transfer", "describe", "manual", "receipt"]
const WelcomeSplash = dynamic(() => import("@/components/brand/welcome-splash"), { ssr: false })

const visited = new Set<string>()

/** The page area. The first visit to a page plays the full entrance; coming back to it is a quick fade. */
function PageMain({ pathname, className, children }: { pathname: string; className: string; children: React.ReactNode }) {
  const [firstVisit] = useState(() => !visited.has(pathname))
  useEffect(() => { visited.add(pathname) }, [pathname])
  return <main id="main" className={cn(className, firstVisit ? "page-enter" : "page-return")}>{children}</main>
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: me, isLoading } = useMe()
  const hideAmounts = useAmountsHidden()
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
      {booting ? (
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
            <PageMain key={`${pathname}:${hideAmounts ? "hidden" : "shown"}`} pathname={pathname} className={fullBleed
              ? "w-full flex-1"
              : "mx-auto w-full max-w-[1240px] flex-1 px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-20"}>
              {children}
            </PageMain>
          </div>
          <MobileNav />
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
