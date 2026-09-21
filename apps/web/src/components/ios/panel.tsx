import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function PanelLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("-mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.875rem] font-medium text-primary transition-opacity hover:opacity-75", className)}>
      {children}<ChevronRight className="size-3.5" strokeWidth={2.2} />
    </Link>
  )
}

/**
 * A titled section. The title sits on the canvas; the content decides whether it needs a surface
 * (a grouped list does, a row of account cards doesn't).
 */
export function Section({ title, description, href, linkLabel = "See all", action, children, className, id }: {
  title?: React.ReactNode
  description?: React.ReactNode
  href?: string
  linkLabel?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn("min-w-0", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      {(title || action || href) && (
        <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && <h2 id={id ? `${id}-title` : undefined} className="section-title truncate">{title}</h2>}
            {description && <p className="truncate text-[0.8125rem] text-muted-foreground">{description}</p>}
          </div>
          {action ?? (href && <PanelLink href={href}>{linkLabel}</PanelLink>)}
        </div>
      )}
      {children}
    </section>
  )
}
