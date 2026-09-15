"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Volume2 } from "lucide-react"
import { audioRunning, playSplash, soundsEnabled, splashTapEnabled } from "@/lib/sound"
import { cn } from "@/lib/utils"

const HOLD_AT = 620
const TOTAL = 3000

export function SplashContent({ animated = false, className, hint }: { animated?: boolean; className?: string; hint?: boolean }) {
  return (
    <div className={cn("relative flex flex-col items-center justify-center", className)}>
      <div className={cn("flex flex-col items-center gap-6 sm:flex-row sm:gap-10", animated && "splash-stage")}>
        <div className={cn(animated && "splash-icon-slide")}>
          <div className={cn(animated && "splash-icon-in")}>
            <Image src="/brand/faldo-icon.svg" alt="" width={180} height={180} priority unoptimized
              className="size-28 drop-shadow-[0_18px_30px_rgb(30_58_36/0.22)] sm:size-44" />
          </div>
        </div>
        <div className={cn("w-[18rem] text-center sm:w-[22rem] sm:text-left", animated && "splash-text-in")}>
          <span className="inline-flex rounded-full bg-card px-3 py-1 text-xs font-bold text-primary shadow-(--shadow-card)">
            Faldo <span className="mx-1 text-muted-foreground/60">·</span> <span className="font-semibold">Money companion</span>
          </span>
          <p className="mt-3 text-[2.1rem] leading-[1.05] font-extrabold tracking-tight text-foreground sm:text-5xl">Your money,<br />made simple.</p>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Track · Plan · Save · Learn</p>
        </div>
      </div>
      <p className={cn("splash-hint absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] flex items-center justify-center gap-2 text-sm font-bold text-primary transition-opacity duration-300",
        hint ? "animate-pulse opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!hint}>
        <Volume2 className="size-4" /> Tap to open
      </p>
      <p className={cn("absolute inset-x-0 bottom-[calc(2rem+env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground", animated && "splash-text-in")}>
        Made by: <span className="font-bold text-foreground">Jake Cardenas</span>
      </p>
    </div>
  )
}

export function Splash({ force = false }: { force?: boolean }) {
  const [mounted, setMounted] = useState(true)
  const [waiting, setWaiting] = useState(false)
  const overlay = useRef<HTMLDivElement>(null)
  const finish = useRef<ReturnType<typeof setTimeout> | null>(null)

  const animations = () => overlay.current?.getAnimations({ subtree: true }) ?? []

  useEffect(() => {
    finish.current = setTimeout(() => setMounted(false), TOTAL)
    const skipped = !force && document.documentElement.dataset.splash === "skip"
    if (skipped) return () => { if (finish.current) clearTimeout(finish.current) }

    const stopSound = playSplash(() => Number(animations().find((a) => (a as CSSAnimation).animationName === "splash-out")?.currentTime ?? 0))
    const hold = setTimeout(() => {
      if (audioRunning() || !soundsEnabled() || !splashTapEnabled()) return
      animations().forEach((a) => { a.pause(); a.currentTime = HOLD_AT })
      if (finish.current) clearTimeout(finish.current)
      setWaiting(true)
    }, HOLD_AT - 20)

    return () => {
      clearTimeout(hold)
      if (finish.current) clearTimeout(finish.current)
      stopSound()
    }
  }, [force])

  useEffect(() => {
    if (!waiting) return
    const resume = () => {
      animations().forEach((a) => a.play())
      setWaiting(false)
      finish.current = setTimeout(() => setMounted(false), TOTAL - HOLD_AT)
    }
    const types = ["pointerdown", "keydown"] as const
    types.forEach((type) => window.addEventListener(type, resume, { once: true }))
    return () => types.forEach((type) => window.removeEventListener(type, resume))
  }, [waiting])

  if (!mounted) return null
  return (
    <div ref={overlay} data-force={force ? "" : undefined} aria-hidden={!waiting} role={waiting ? "button" : undefined}
      aria-label={waiting ? "Tap to open Faldo" : undefined} tabIndex={waiting ? 0 : -1}
      className={cn("splash-overlay fixed inset-0 z-[100] bg-background outline-none", waiting && "cursor-pointer")}>
      <SplashContent animated hint={waiting} className="h-full" />
    </div>
  )
}
