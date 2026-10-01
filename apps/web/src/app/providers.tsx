"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { SoundEffects } from "@/app/_shell/sound-effects"
import { Toaster } from "@/shared/ui/sonner"
import { UpdateCheck } from "@/app/_shell/update-check"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { ApiError, whenSignedOut } from "@/shared/api/client"
import { forgetUser } from "@/entities/session"
import { isPublicPath } from "@/shared/config/routes"

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  )
  // A request found the session gone: nothing of that person's stays in memory while the tab goes to Log in (or, for a
  // demo that ended, the start page, which says so). On the sign-in screens themselves a 401 is just a wrong password.
  useEffect(() => {
    whenSignedOut((reason) => {
      const { pathname } = window.location
      if (isPublicPath(pathname)) return
      forgetUser(client)
      toast.dismiss()
      if (reason === "expired") return window.location.replace(`/login?next=${encodeURIComponent(pathname)}`)
      // A demo's cookie can never work again: drop it, so opening Faldo later shows the start page, not this notice.
      void fetch("/logout", { method: "POST", credentials: "same-origin", headers: { "x-faldo-client": "web" }, keepalive: true })
        .catch(() => {})
        .finally(() => window.location.replace("/welcome?demo=ended"))
    })
    return () => whenSignedOut(null)
  }, [client])
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={250}>
          {children}
          <SoundEffects />
          <UpdateCheck />
          <Toaster position="top-center" offset={{ top: "calc(var(--top-inset) + 12px)" }} mobileOffset={{ top: "calc(var(--top-inset) + 8px)" }} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
