import {
  ArrowLeftRight, Briefcase, Car, CircleDashed, Clapperboard, Gift, GraduationCap, HeartPulse, Home, Laptop, Plane,
  PlusCircle, Receipt, Repeat, RotateCcw, ShoppingBag, ShoppingBasket, Sparkles, Utensils, Wallet, Zap, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, "shopping-basket": ShoppingBasket, car: Car, zap: Zap, home: Home, "shopping-bag": ShoppingBag,
  repeat: Repeat, clapperboard: Clapperboard, "heart-pulse": HeartPulse, sparkles: Sparkles, "graduation-cap": GraduationCap,
  plane: Plane, gift: Gift, receipt: Receipt, "circle-dashed": CircleDashed, briefcase: Briefcase, laptop: Laptop,
  wallet: Wallet, "rotate-ccw": RotateCcw, "plus-circle": PlusCircle, transfer: ArrowLeftRight,
}

export function CategoryIcon({ icon, color, size = "md", className }: { icon?: string | null; color?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = ICONS[icon ?? ""] ?? CircleDashed
  const tint = color ?? "#6b7a72"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-4",
        size === "lg" && "size-11 [&_svg]:size-5",
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklab, ${tint} 13%, transparent)`, color: tint }}
      aria-hidden
    >
      <Icon strokeWidth={1.85} />
    </span>
  )
}
