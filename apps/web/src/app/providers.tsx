"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useState } from "react"
import { SoundEffects } from "@/components/sound-effects"
import { Toaster } from "@/components/ui/sonner"
import { UpdateCheck } from "@/components/update-check"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ApiError } from "@/lib/api"

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
