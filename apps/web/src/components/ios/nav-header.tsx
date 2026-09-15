"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

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
      <div className={cn("sticky top-0 z-30 -mx-4 px-4 pt-safe transition-[background-color,border-color] duration-200 sm:-mx-6 sm:px-6 lg:hidden",
        compact ? "glass border-b border-border/70" : "border-b border-transparent")}>
        <div className="relative flex h-12 items-center gap-2">
          {back ? (
            <Link href={back.href} className="pressable -ml-1.5 flex h-9 items-center gap-0.5 rounded-lg pr-2 text-[0.9375rem] text-primary">
              <ChevronLeft className="size-5" strokeWidth={2} />{back.label}
            </Link>
          ) : <span className="w-2" />}
          <p className={cn("pointer-events-none absolute inset-x-24 truncate text-center text-[0.9375rem] font-semibold transition-opacity duration-200",
            compact ? "opacity-100" : "opacity-0")} aria-hidden={!compact}>{title}</p>
          <div className="ml-auto flex items-center gap-1">{mobileActions === "bar" && actions}</div>
        </div>
      </div>
      <header className={cn("flex flex-col gap-3 pt-1 pb-1 sm:flex-row sm:items-end sm:justify-between lg:pt-10", className)}>
        <div className="min-w-0">
          {back && back.href !== "/" && (
            <Link href={back.href} className="mb-2 hidden items-center gap-0.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground lg:inline-flex">
              <ChevronLeft className="size-4" />{back.label}
            </Link>
          )}
          <h1 className="page-title lg:text-[1.875rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className={cn("flex-wrap items-center gap-2 lg:flex", mobileActions === "below" ? "flex" : "hidden")}>{actions}</div>}
      </header>
      <div ref={sentinel} aria-hidden className="-mt-3 h-px" />
    </>
  )
}

export function HeaderButton({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button type="button" className={cn("pressable inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground", className)} {...props}>
      {children}
    </button>
  )
}
