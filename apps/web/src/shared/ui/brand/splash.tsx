"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { cn } from "@/shared/lib/utils"

const TOTAL = 3000

function SplashContent({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex flex-col items-center justify-center font-brand", className)}>
      <div className="splash-stage flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
        <div className="splash-icon-slide">
          <div className="splash-icon-in">
            <Image src="/brand/faldo-panda-512.png" alt="" width={180} height={180} priority unoptimized
              className="size-28 drop-shadow-[0_18px_30px_rgb(30_58_36/0.22)] sm:size-44" />
          </div>
        </div>
        <div className="splash-text-in w-[18rem] text-center sm:w-[22rem] sm:text-left">
          <span className="inline-flex rounded-full bg-card px-3 py-1 text-xs font-bold text-primary shadow-(--shadow-card)">
            Faldo <span className="mx-1 text-muted-foreground/60">·</span> <span className="font-semibold">Money companion</span>
          </span>
          <p className="mt-3 text-[2.1rem] leading-[1.05] font-extrabold tracking-tight text-foreground sm:text-5xl">Your money,<br />made simple.</p>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Track · Plan · Save · Learn</p>
        </div>
      </div>
      <p className="splash-text-in absolute inset-x-0 bottom-[calc(2rem+env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
        Made by: <span className="font-bold text-foreground">Jake Cardenas</span>
      </p>
    </div>
  )
}

/** The Faldo welcome: the panda, then the name, then it fades into the app. Played once after signing in (see welcome-splash). */
export function Splash() {
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(false), TOTAL)
    return () => clearTimeout(timer)
  }, [])

  if (!mounted) return null
  return (
    <div aria-hidden className="splash-overlay fixed inset-0 z-[100] bg-background">
      <SplashContent className="h-full" />
    </div>
  )
}
