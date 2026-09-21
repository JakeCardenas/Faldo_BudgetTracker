"use client"

import { usePathname } from "next/navigation"
import { LargeTitle } from "@/components/ios/nav-header"
import { cn } from "@/lib/utils"

const PLAN_CHILDREN = ["/budgets", "/goals", "/bills", "/debts", "/forecast"]
const YOU_CHILDREN = ["/settings", "/streaks", "/learn", "/tools", "/insights"]

export function PageHeader({ title, description, actions, className }: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const back = PLAN_CHILDREN.some((p) => pathname.startsWith(p)) ? { href: "/plan", label: "Plans" }
    : pathname.startsWith("/tools/") ? { href: "/tools", label: "Tools" }
      : pathname.startsWith("/learn/") ? { href: "/learn", label: "Learn" }
        : YOU_CHILDREN.some((p) => pathname.startsWith(p)) ? { href: "/you", label: "You" }
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
    <section className={cn("card-surface flex min-w-0 flex-col", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0 space-y-0.5">
            {title && <h2 className="section-title">{title}</h2>}
            {description && <p className="text-[0.8125rem] text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
    </section>
  )
}
