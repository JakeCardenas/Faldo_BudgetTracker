"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { setChromeAway, useChromeAway } from "@/lib/chrome"
import { cn } from "@/lib/utils"

/**
 * The page header. On phones it is a Threads-style bar: a plain back chevron, the title centred, and any
 * actions as icons on the right. Pages you reach from somewhere else (with `back`) carry their title in
 * that bar; top-level pages keep a large title that the bar picks up once you scroll. Descriptions show
 * on larger screens only. On desktop it is a large title with the description and a back link.
 */
export function LargeTitle({ title, subtitle, back, actions, className, mobileActions = "bar" }: {
  title: string
  subtitle?: React.ReactNode
  back?: { href: string; label: string }
  actions?: React.ReactNode
  className?: string
  mobileActions?: "bar" | "below"
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const away = useChromeAway()

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { rootMargin: "-8px 0px 0px 0px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {/* On phones the bar steps aside while you scroll down and comes back when you scroll up, with the
          tab bar (see lib/chrome); the soft edge behind it then shrinks to cover just the status bar. */}
      <div onFocus={() => setChromeAway(false)} className="sticky top-0 isolate z-30 -mx-5 px-5 pt-safe sm:-mx-6 sm:px-6 lg:hidden">
        {/* Always painted (it matches the page at the top): iOS 26 tints the status bar from the sticky layer
            at the top of the screen, and a see-through one turned the strip grey. */}
        <div aria-hidden className={cn("scroll-edge pointer-events-none absolute inset-x-0 top-0 -z-10 transition-[height] duration-200",
          away ? "h-(--top-inset)" : "h-full")} />
        <div data-away={away} className="chrome-hide relative flex h-11 items-center gap-2">
          {back ? (
            <Link href={back.href} aria-label={`Back to ${back.label}`} className="pressable -ml-2.5 flex size-11 items-center justify-center rounded-full text-foreground">
              <ChevronLeft className="size-7" strokeWidth={1.9} />
            </Link>
          ) : <span className="w-2" />}
          <p className={cn("pointer-events-none absolute inset-x-24 truncate text-center text-[1.0625rem] font-bold tracking-[-0.01em] transition-opacity duration-200",
            back || compact ? "opacity-100" : "opacity-0")} aria-hidden={!(back || compact)}>{title}</p>
          <div className="ml-auto flex items-center gap-1">{mobileActions === "bar" && actions}</div>
        </div>
      </div>
      <header className={cn("flex flex-col gap-3 pt-1 pb-2 sm:flex-row sm:items-end sm:justify-between lg:pt-9 lg:pb-3", back && (mobileActions === "below" && actions ? "max-lg:pt-0 max-lg:pb-1" : "max-lg:sr-only"), className)}>
        <div className="min-w-0">
          {back && back.href !== "/" && (
            <Link href={back.href} className="mb-2 hidden items-center gap-0.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground lg:inline-flex">
              <ChevronLeft className="size-4" />{back.label}
            </Link>
          )}
          <h1 className={cn("page-title lg:text-[1.875rem]", back && "max-lg:sr-only")}>{title}</h1>
          {subtitle && <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground max-lg:hidden">{subtitle}</p>}
        </div>
        {actions && <div className={cn("flex-wrap items-center gap-2 lg:flex", mobileActions === "below" ? "flex" : "hidden")}>{actions}</div>}
      </header>
      <div ref={sentinel} aria-hidden className="-mt-3 h-px" />
    </>
  )
}

/** A small floating header control: liquid glass, a circle when it only holds an icon. */
export function HeaderButton({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button type="button" className={cn("glass-control pressable inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground [&_svg]:size-[1.05rem] [&_svg]:text-foreground/75", className)} {...props}>
      {children}
    </button>
  )
}
