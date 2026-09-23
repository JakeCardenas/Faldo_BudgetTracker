import {
  Car, Gem, GraduationCap, Heart, House, Laptop, LifeBuoy, Plane, Smartphone, Target, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const GOAL_ICONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "target", label: "General", icon: Target },
  { id: "lifebuoy", label: "Emergency", icon: LifeBuoy },
  { id: "laptop", label: "Gadget", icon: Laptop },
  { id: "phone", label: "Phone", icon: Smartphone },
  { id: "plane", label: "Travel", icon: Plane },
  { id: "school", label: "Education", icon: GraduationCap },
  { id: "home", label: "Home", icon: House },
  { id: "car", label: "Car", icon: Car },
  { id: "ring", label: "Wedding", icon: Gem },
  { id: "heart", label: "Family", icon: Heart },
]

const LEGACY: Record<string, string> = {
  "💻": "laptop", "🛟": "lifebuoy", "✈️": "plane", "✈": "plane", "📱": "phone", "🎓": "school", "🏠": "home", "🚗": "car", "💍": "ring", "🎯": "target",
}

export function goalIconId(value: string | null | undefined) {
  if (!value) return "target"
  if (GOAL_ICONS.some((g) => g.id === value)) return value
  return LEGACY[value] ?? "target"
}

export function GoalIcon({ value, className }: { value: string | null | undefined; className?: string }) {
  const Icon = GOAL_ICONS.find((g) => g.id === goalIconId(value))?.icon ?? Target
  return <Icon className={cn("size-4", className)} strokeWidth={2} aria-hidden />
}
