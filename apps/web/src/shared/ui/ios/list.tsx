import Link from "next/link"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/shared/lib/utils"

/**
 * A grouped list: rows in one white card, split by hairlines, with an optional small caps label above the card.
 * Groups are separated by space; a divided group (Sign out) sits under a hairline of its own.
 */
export function ListGroup({ title, divider, children, className }: {
  title?: React.ReactNode
  /** Space and a hairline above the group, as between the menu and Sign out. */
  divider?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn(divider && "border-t border-border/70 pt-4", className)}>
      {title && <h2 className="label-caps px-1 pb-2">{title}</h2>}
      <div className="ios-group flex flex-col divide-y divide-border/60">{children}</div>
    </section>
  )
}

/** A row's icon: Faldo's green on a sage tile, so every list reads the same. */
export function RowIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-secondary text-primary", className)}>
      <Icon className="size-[1.125rem]" strokeWidth={2} aria-hidden />
    </span>
  )
}

/**
 * One row: an icon tile, a label and, when it helps, a quieter second line. Rows that open something end in a
 * chevron; a switch or other control sits at the end instead. A destructive row (Sign out) is red text alone.
 */
export function ListRow({ icon, leading, title, detail, href, external, onClick, trailing, toggle, destructive, className }: {
  icon?: LucideIcon
  leading?: React.ReactNode
  title: React.ReactNode
  /** A second, quieter line under the title: where things stand. */
  detail?: React.ReactNode
  href?: string
  /** A plain link (a download or an API route) instead of in-app navigation. */
  external?: boolean
  onClick?: () => void
  /** A control at the end of the row, such as a switch. */
  trailing?: React.ReactNode
  /** The trailing control is a switch: the whole row is its label, so tapping anywhere flips it. */
  toggle?: boolean
  destructive?: boolean
  className?: string
}) {
  const opens = Boolean(href || onClick) && !trailing && !destructive
  const body = (
    <>
      {!destructive && (leading ?? (icon && <RowIcon icon={icon} />))}
      {detail !== undefined ? (
        <span className="min-w-0 flex-1 py-2.5">
          <span className={cn("block truncate text-[0.9375rem] font-medium tracking-[-0.01em]", destructive && "text-destructive")}>{title}</span>
          <span className="tabular mt-0.5 block min-h-[1.125rem] truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{detail}</span>
        </span>
      ) : <span className={cn("min-w-0 flex-1 truncate text-[0.9375rem] font-medium tracking-[-0.01em]", destructive && "text-destructive")}>{title}</span>}
      {trailing}
      {opens && <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />}
    </>
  )
  const classes = cn("flex min-h-[3.5rem] w-full items-center gap-3.5 px-4 text-left text-foreground transition-colors duration-150 outline-none focus-visible:bg-accent",
    (href || onClick) && "hover:bg-accent/60 active:bg-accent", className)
  if (href && external) return <a href={href} className={classes}>{body}</a>
  if (href) return <Link href={href} className={classes}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={classes}>{body}</button>
  if (toggle) return <label className={cn(classes, "cursor-pointer active:bg-accent")}>{body}</label>
  return <div className={classes}>{body}</div>
}
