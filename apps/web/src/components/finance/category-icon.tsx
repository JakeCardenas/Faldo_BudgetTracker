import {
  ArrowLeftRight, BookOpen, Briefcase, Bus, CircleEllipsis, Gift, HeartPulse, House, Laptop, Plane, PlusCircle, Receipt,
  Repeat, RotateCcw, ShoppingBag, ShoppingCart, Soup, Sparkles, Ticket, UsersRound, Wallet, Zap, type LucideIcon,
} from "lucide-react"
import { PALETTE } from "@/lib/palette"
import { cn } from "@/lib/utils"

/**
 * A soft wash of a colour with its glyph deepened (lightened in dark mode), for any round badge that carries a
 * palette colour: category icons, the quick actions, account shortcuts, people in Money owed. Set the colour as the
 * `--cat` custom property on the same element.
 */
export const TINTED = "bg-[color-mix(in_oklab,var(--cat)_15%,transparent)] text-[color-mix(in_oklab,var(--cat)_74%,black)] dark:bg-[color-mix(in_oklab,var(--cat)_22%,transparent)] dark:text-[color-mix(in_oklab,var(--cat)_78%,white)]"

/** Money owed (utang, loans, split bills): people, since it is always money between you and someone. */
export const MoneyOwedIcon = UsersRound

// Keys are the icon names stored on categories. The glyphs are the simplest lucide shapes that say the thing, drawn
// at the tab bar's 2px stroke so lists, the ring and the bar feel like one family.
const ICONS: Record<string, LucideIcon> = {
  utensils: Soup, "shopping-basket": ShoppingCart, car: Bus, zap: Zap, home: House, "shopping-bag": ShoppingBag,
  repeat: Repeat, clapperboard: Ticket, "heart-pulse": HeartPulse, sparkles: Sparkles, "graduation-cap": BookOpen,
  plane: Plane, gift: Gift, receipt: Receipt, "circle-dashed": CircleEllipsis, briefcase: Briefcase, laptop: Laptop,
  wallet: Wallet, "rotate-ccw": RotateCcw, "plus-circle": PlusCircle, transfer: ArrowLeftRight, owed: MoneyOwedIcon,
}

/**
 * A category's glyph on a soft wash of its colour. The glyph is the colour deepened (lightened in dark mode) so pale
 * palette colours like gold and lime still read clearly.
 */
export function CategoryIcon({ icon, color, size = "md", className }: { icon?: string | null; color?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = ICONS[icon ?? ""] ?? CircleEllipsis
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        TINTED,
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-10 [&_svg]:size-5",
        size === "lg" && "size-11 [&_svg]:size-[1.35rem]",
        className,
      )}
      style={{ "--cat": color ?? PALETTE.slate } as React.CSSProperties}
      aria-hidden
    >
      <Icon strokeWidth={2} />
    </span>
  )
}
