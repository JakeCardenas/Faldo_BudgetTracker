"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { AddTransactionDialog, type AddMode } from "@/components/capture/add-transaction-dialog"
import type { EntryPreset } from "@/components/capture/keypad-entry"
import { MascotArt } from "@/components/brand/logo"
import { TransactionSheet } from "@/components/finance/transaction-sheet"
import { AppActionsContext, type AddModeOption } from "@/components/layout/app-context"
import { CommandSearch } from "@/components/layout/command-search"
import { MobileNav } from "@/components/layout/mobile-nav"
import { MoreSheet } from "@/components/layout/more-sheet"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { useMe } from "@/lib/queries"
import type { Receipt } from "@/lib/types"

const ADD_MODES: AddModeOption[] = ["expense", "income", "transfer", "describe", "manual", "receipt"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: me, isLoading } = useMe()
  const { setTheme } = useTheme()
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>("expense")
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [preset, setPreset] = useState<EntryPreset | undefined>()
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const theme = me?.settings.theme

  useEffect(() => {
    if (me && !me.settings.onboarding_completed_at) router.replace("/onboarding")
  }, [me, router])

  useEffect(() => {
    if (theme) setTheme(theme)
  }, [theme, setTheme])

  const openAddTransaction = useCallback((options?: { mode?: AddModeOption; receipt?: Receipt; preset?: EntryPreset }) => {
    setReceipt(options?.receipt ?? null)
    setPreset(options?.preset)
    setAddMode(options?.receipt ? "receipt" : options?.mode ?? "expense")
    setAddOpen(true)
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
    openMore: () => setMoreOpen(true),
    openSearch: () => setSearchOpen(true),
    openTransaction: (id: string) => setTransactionId(id),
  }), [openAddTransaction])

  if (isLoading || !me || !me.settings.onboarding_completed_at) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <MascotArt className="animate-bob w-24" priority />
        <p className="text-sm font-semibold text-muted-foreground">Getting your money ready…</p>
      </div>
    )
  }

  const fullBleed = pathname.startsWith("/assistant")

  return (
    <AppActionsContext.Provider value={actions}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" key={pathname} className={fullBleed
            ? "w-full flex-1"
            : "animate-rise mx-auto w-full max-w-[1200px] flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-12"}>
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
      <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} mode={addMode} onModeChange={setAddMode} receipt={receipt} preset={preset} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} onAddTransaction={() => openAddTransaction()} onOpenTransaction={setTransactionId} />
      <TransactionSheet id={transactionId} onOpenChange={(open) => { if (!open) setTransactionId(null) }} />
    </AppActionsContext.Provider>
  )
}
