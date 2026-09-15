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
      <div className={cn("sticky top-0 z-30 -mx-4 px-4 pt-safe transition-colors duration-200 sm:-mx-6 sm:px-6 lg:hidden",
        compact ? "glass border-b border-border/60" : "border-b border-transparent")}>
        <div className="relative flex h-11 items-center gap-2">
          {back ? (
            <Link href={back.href} className="pressable -ml-2 flex h-9 items-center gap-0.5 rounded-full pr-2 text-[0.95rem] font-medium text-primary">
              <ChevronLeft className="size-6" strokeWidth={2.2} />{back.label}
            </Link>
          ) : <span className="w-2" />}
          <p className={cn("pointer-events-none absolute inset-x-20 truncate text-center text-[0.95rem] font-bold transition-opacity duration-200",
            compact ? "opacity-100" : "opacity-0")} aria-hidden={!compact}>{title}</p>
          <div className="ml-auto flex items-center gap-1.5">{mobileActions === "bar" && actions}</div>
        </div>
      </div>
      <div className={cn("flex flex-col gap-3 pt-1 sm:flex-row sm:items-end sm:justify-between lg:pt-4", className)}>
        <div className="min-w-0 space-y-1">
          {back && (
            <Link href={back.href} className="hidden items-center gap-0.5 text-sm font-semibold text-primary hover:underline lg:inline-flex">
              <ChevronLeft className="size-4" />{back.label}
            </Link>
          )}
          <h1 className="text-[2rem] leading-[1.1] font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className={cn("flex-wrap items-center gap-2 lg:flex", mobileActions === "below" ? "flex" : "hidden")}>{actions}</div>}
      </div>
      <div ref={sentinel} aria-hidden className="-mt-3 h-px" />
    </>
  )
}

export function HeaderButton({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button type="button" className={cn("pressable flex h-9 items-center justify-center gap-1.5 rounded-full border bg-card px-3 text-sm font-semibold text-foreground shadow-(--shadow-card) hover:bg-muted", className)} {...props}>
      {children}
    </button>
  )
}
