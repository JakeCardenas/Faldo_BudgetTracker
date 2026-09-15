import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function PanelLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("-mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 text-[0.8125rem] font-medium text-primary transition-opacity hover:opacity-80", className)}>
      {children}<ChevronRight className="size-3.5" strokeWidth={2} />
    </Link>
  )
}

export function Panel({ title, description, href, linkLabel = "See all", action, children, className, bodyClassName, id }: {
  title?: React.ReactNode
  description?: React.ReactNode
  href?: string
  linkLabel?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}) {
  return (
    <section id={id} className={cn("card-surface flex min-w-0 flex-col", className)}>
      {(title || action || href) && (
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 pt-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="section-title truncate">{title}</h2>}
            {description && <p className="truncate text-[0.8125rem] text-muted-foreground">{description}</p>}
          </div>
          {action ?? (href && <PanelLink href={href}>{linkLabel}</PanelLink>)}
        </div>
      )}
      <div className={cn("flex-1 px-4 pt-2 pb-4 sm:px-5 sm:pb-5", bodyClassName)}>{children}</div>
    </section>
  )
}
