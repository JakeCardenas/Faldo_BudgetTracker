"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AddTransactionDialog, type AddMode } from "@/components/capture/add-transaction-dialog"
import { TransactionSheet } from "@/components/finance/transaction-sheet"
import { AppActionsContext } from "@/components/layout/app-context"
import { CommandSearch } from "@/components/layout/command-search"
import { MobileNav } from "@/components/layout/mobile-nav"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { LogoMark } from "@/components/brand/logo"
import { useMe } from "@/lib/queries"
import type { Receipt } from "@/lib/types"

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: me, isLoading } = useMe()
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>("describe")
  const [searchOpen, setSearchOpen] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)

  useEffect(() => {
    if (me && !me.settings.onboarding_completed_at) router.replace("/onboarding")
  }, [me, router])

  const [receipt, setReceipt] = useState<Receipt | null>(null)

  const openAddTransaction = useCallback((options?: { mode?: AddMode; receipt?: Receipt }) => {
    setReceipt(options?.receipt ?? null)
    setAddMode(options?.receipt ? "receipt" : options?.mode ?? "describe")
    setAddOpen(true)
  }, [])
  const actions = useMemo(() => ({
    openAddTransaction,
    openSearch: () => setSearchOpen(true),
    openTransaction: (id: string) => setTransactionId(id),
  }), [openAddTransaction])

  if (isLoading || !me || !me.settings.onboarding_completed_at) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    )
  }

  return (
    <AppActionsContext.Provider value={actions}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" key={pathname} className={pathname.startsWith("/assistant")
            ? "w-full flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"
            : "animate-rise mx-auto w-full max-w-[1280px] flex-1 px-4 pt-2 pb-28 sm:px-6 lg:px-8 lg:pb-12"}>
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
      <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} mode={addMode} onModeChange={setAddMode} receipt={receipt} />
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} onAddTransaction={() => openAddTransaction()} onOpenTransaction={setTransactionId} />
      <TransactionSheet id={transactionId} onOpenChange={(open) => { if (!open) setTransactionId(null) }} />
    </AppActionsContext.Provider>
  )
}
