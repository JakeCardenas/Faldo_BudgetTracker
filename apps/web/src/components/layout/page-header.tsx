"use client"

import { usePathname } from "next/navigation"
import { LargeTitle } from "@/components/ios/nav-header"
import { cn } from "@/lib/utils"

const PLAN_CHILDREN = ["/budgets", "/goals", "/bills", "/debts", "/forecast"]

export function PageHeader({ title, description, actions, className }: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const back = PLAN_CHILDREN.some((p) => pathname.startsWith(p)) ? { href: "/plan", label: "Plan" }
    : pathname.startsWith("/tools/") ? { href: "/tools", label: "Tools" }
      : pathname.startsWith("/learn/") ? { href: "/learn", label: "Learn" }
        : pathname === "/" ? undefined : { href: "/", label: "Home" }
  return <LargeTitle title={title} subtitle={description} actions={actions} back={back} className={className} mobileActions="below" />
}

export function SectionCard({ title, description, action, children, className, bodyClassName }: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("card-surface flex flex-col", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="space-y-0.5">
            {title && <h2 className="text-base font-extrabold tracking-tight">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
    </section>
  )
}
