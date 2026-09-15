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
        <div className="flex items-end justify-between gap-3 px-1">
          {title && <h2 className="text-[0.8125rem] font-medium text-muted-foreground">{title}</h2>}
          {action}
        </div>
      )}
      <div className="ios-group divide-y divide-border/70">{children}</div>
      {footer && <p className="px-1 text-xs leading-relaxed text-muted-foreground">{footer}</p>}
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
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/75", destructive && "bg-destructive/10 text-destructive", iconClassName)} style={iconStyle}>
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
      ))}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[0.9375rem]", destructive && "text-destructive")}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[0.8125rem] text-muted-foreground">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-sm text-muted-foreground">{value}</span>}
      {(chevron ?? Boolean(href)) && <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />}
    </>
  )
  const classes = cn("flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", (href || onClick) && "hover:bg-accent/60 active:bg-accent", className)
  if (href) return <Link href={href} className={classes}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={classes}>{body}</button>
  return <div className={classes}>{body}</div>
}
