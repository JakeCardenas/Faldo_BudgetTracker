import Link from "next/link"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ListGroup({ title, footer, action, children, className }: {
  title?: React.ReactNode
  footer?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-4">
          {title && <h2 className="eyebrow">{title}</h2>}
          {action}
        </div>
      )}
      <div className="ios-group divide-y divide-border/60">{children}</div>
      {footer && <p className="px-4 text-xs text-muted-foreground">{footer}</p>}
    </section>
  )
}

export function ListRow({ icon: Icon, iconClassName, iconStyle, leading, title, subtitle, value, href, onClick, chevron, destructive, className }: {
  icon?: LucideIcon
  iconClassName?: string
  iconStyle?: React.CSSProperties
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  value?: React.ReactNode
  href?: string
  onClick?: () => void
  chevron?: boolean
  destructive?: boolean
  className?: string
}) {
  const body = (
    <>
      {leading ?? (Icon && (
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[0.6rem] bg-secondary text-primary", iconClassName)} style={iconStyle}>
          <Icon className="size-[1.05rem]" strokeWidth={2} />
        </span>
      ))}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[0.95rem] font-medium", destructive && "text-destructive")}>{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-sm text-muted-foreground">{value}</span>}
      {(chevron ?? Boolean(href)) && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />}
    </>
  )
  const classes = cn("flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", (href || onClick) && "hover:bg-muted/60 active:bg-muted", className)
  if (href) return <Link href={href} className={classes}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={classes}>{body}</button>
  return <div className={classes}>{body}</div>
}
