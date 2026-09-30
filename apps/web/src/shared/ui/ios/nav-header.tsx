"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/shared/lib/utils"

/**
 * The page header. On phones a slim bar stays at the top: a round back button when the page was reached from
 * somewhere else, the title centred once it scrolls away (or at once on pages with a back button), and actions as
 * round buttons on the right. Under it, top-level pages show their large title and a one-line description. On
 * desktop it is the large title with the description and a back link.
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

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { rootMargin: "-8px 0px 0px 0px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div className="sticky top-0 isolate z-30 -mx-5 px-5 pt-safe sm:-mx-6 sm:px-6 lg:hidden">
        {/* Always painted (it matches the page at the top): iOS 26 tints the status bar from the sticky layer
            at the top of the screen, and a see-through one turned the strip grey. */}
        <div aria-hidden className="scroll-edge pointer-events-none absolute inset-0 -z-10" />
        <div className="relative flex h-14 items-center gap-2">
          {back ? (
            <Link href={back.href} aria-label={`Back to ${back.label}`}
              className="pressable flex size-10 items-center justify-center rounded-full bg-card text-primary shadow-(--shadow-card)">
              <ChevronLeft className="size-5" strokeWidth={2.2} />
            </Link>
          ) : <span className="w-2" />}
          <p className={cn("pointer-events-none absolute inset-x-24 truncate text-center text-[1.0625rem] font-bold tracking-[-0.015em] transition-opacity duration-200",
            back || compact ? "opacity-100" : "opacity-0")} aria-hidden={!(back || compact)}>{title}</p>
          <div className="ml-auto flex items-center gap-2">{mobileActions === "bar" && actions}</div>
        </div>
      </div>
      <header className={cn("flex flex-col gap-3 pt-1 pb-3 sm:flex-row sm:items-end sm:justify-between lg:pt-10 lg:pb-4", back && (mobileActions === "below" && actions ? "max-lg:pt-0 max-lg:pb-1" : "max-lg:sr-only"), className)}>
        <div className="min-w-0">
          {back && back.href !== "/" && (
            <Link href={back.href} className="mb-2 hidden items-center gap-0.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground lg:inline-flex">
              <ChevronLeft className="size-4" />{back.label}
            </Link>
          )}
          <h1 className={cn("page-title lg:text-[2rem]", back && "max-lg:sr-only")}>{title}</h1>
          {subtitle && <p className={cn("mt-1 max-w-[60ch] text-[0.875rem] text-muted-foreground", back && "max-lg:hidden")}>{subtitle}</p>}
        </div>
        {actions && <div className={cn("flex-wrap items-center gap-2 lg:flex", mobileActions === "below" ? "flex" : "hidden")}>{actions}</div>}
      </header>
      <div ref={sentinel} aria-hidden className="-mt-3 h-px" />
    </>
  )
}

/** A round header control: a white button with Faldo's green icon, a pill when it carries a word. */
export function HeaderButton({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button type="button" className={cn("pressable hit inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full bg-card px-3 text-sm font-semibold text-foreground shadow-(--shadow-card) [&_svg]:size-[1.125rem] [&_svg]:text-primary", className)} {...props}>
      {children}
    </button>
  )
}
