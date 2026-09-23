import Link from "next/link"
import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * A Threads-style list: rows sit straight on the page, no card around them. Groups are separated by
 * space and a hairline rather than headings; a title, when a group needs one, is a quiet label.
 */
export function ListGroup({ title, divider, children, className }: {
  title?: React.ReactNode
  /** A hairline above the group, as between the menu and Sign out. */
  divider?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn(divider && "border-t border-border/70 pt-3", className)}>
      {title && <h2 className="px-1 pb-1 text-[0.8125rem] font-medium text-muted-foreground">{title}</h2>}
      <div className="-mx-2 flex flex-col">{children}</div>
    </section>
  )
}

/**
 * One row: an outline icon and a short label, nothing else. No descriptions, chevrons or icon tiles;
 * a destructive row (Sign out) is red text on its own.
 */
export function ListRow({ icon: Icon, leading, title, detail, href, external, onClick, trailing, toggle, destructive, className }: {
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
  const body = (
    <>
      {!destructive && (leading ?? (Icon && <Icon className="size-6 shrink-0" strokeWidth={2} />))}
      {detail !== undefined ? (
        <span className="min-w-0 flex-1 py-2">
          <span className={cn("block truncate text-[1.0625rem] tracking-[-0.01em]", destructive && "text-destructive")}>{title}</span>
          <span className="tabular mt-0.5 block min-h-[1.125rem] truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{detail}</span>
        </span>
      ) : <span className={cn("min-w-0 flex-1 truncate text-[1.0625rem] tracking-[-0.01em]", destructive && "text-destructive")}>{title}</span>}
      {trailing}
    </>
  )
  const classes = cn("flex min-h-[3.25rem] w-full items-center gap-4 rounded-xl px-2 text-left text-foreground transition-[background-color,scale] duration-200 ease-(--ease-spring) outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    (href || onClick) && "hover:bg-accent/60 active:scale-[0.985] active:bg-accent", className)
  if (href && external) return <a href={href} className={classes}>{body}</a>
  if (href) return <Link href={href} className={classes}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={classes}>{body}</button>
  if (toggle) return <label className={cn(classes, "cursor-pointer active:bg-accent")}>{body}</label>
  return <div className={classes}>{body}</div>
}
