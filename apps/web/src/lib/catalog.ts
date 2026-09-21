import {
  BookOpenCheck, CalendarCheck, CalendarClock, CalendarDays, Calculator, Crown, Dumbbell, Flag, Flame, Medal, MessageCircle, ReceiptText, Sprout, Target,
  type LucideIcon,
} from "lucide-react"
import type { PandaPose } from "@/components/brand/panda"

/**
 * Unlockable Faldo poses. The ids are the backend's reward ids (they began as outfits); each now
 * unlocks one of the canonical panda artworks, shown on Home.
 */
export const OUTFIT_INFO: Record<string, { name: string; hint: string; pose: PandaPose }> = {
  classic: { name: "Bamboo buddy", hint: "Always available", pose: "bamboo" },
  bucket_hat: { name: "On the go", hint: "Keep a 3-day streak", pose: "backpack" },
  scarf: { name: "Cozy day", hint: "Keep a 7-day streak", pose: "cozy" },
  headphones: { name: "Milk tea break", hint: "Ask Faldo a question", pose: "boba" },
  flower_crown: { name: "Snack time", hint: "Create a savings goal", pose: "munch" },
  grad_cap: { name: "Ramen night", hint: "Finish 3 lessons", pose: "ramen" },
  shades: { name: "Hello there", hint: "Keep a 14-day streak", pose: "wave" },
  crown: { name: "Happy panda", hint: "Keep a 30-day streak", pose: "happy" },
}

export function poseFor(outfit?: string | null): PandaPose {
  return OUTFIT_INFO[outfit ?? "classic"]?.pose ?? "bamboo"
}

/** Unlockable green environments for the Home hero. */
export const BACKGROUND_INFO: Record<string, { name: string; hint: string; from: string; to: string }> = {
  meadow: { name: "Bamboo grove", hint: "Always available", from: "#17462c", to: "#2f7a4c" },
  sunrise: { name: "Morning light", hint: "Log two days in a row", from: "#1b4a30", to: "#3d7f4f" },
  terraces: { name: "Rice terraces", hint: "Keep a 7-day streak", from: "#23502a", to: "#4f8a3c" },
  lagoon: { name: "Island lagoon", hint: "Set up a budget", from: "#0f4a44", to: "#23806b" },
  hills: { name: "Highlands", hint: "Keep a 14-day streak", from: "#1e4032", to: "#48805f" },
  bay_sunset: { name: "Golden hour", hint: "Track a recurring bill", from: "#28452c", to: "#6a7f3a" },
  night_market: { name: "Night grove", hint: "Keep a 30-day streak", from: "#0c1f17", to: "#1f4a33" },
}

export function environmentFor(id?: string | null) {
  return BACKGROUND_INFO[id ?? "meadow"] ?? BACKGROUND_INFO.meadow
}

export const BADGE_ART: Record<string, { icon: LucideIcon }> = {
  first_sprout: { icon: Sprout },
  two_in_a_row: { icon: CalendarCheck },
  warming_up: { icon: Flame },
  full_week: { icon: CalendarDays },
  fortnight_focus: { icon: Target },
  monthly_habit: { icon: Medal },
  sixty_strong: { icon: Dumbbell },
  hundred_club: { icon: Crown },
  budget_builder: { icon: Calculator },
  goal_setter: { icon: Flag },
  bill_planner: { icon: CalendarClock },
  receipt_ranger: { icon: ReceiptText },
  curious_mind: { icon: MessageCircle },
  scholar: { icon: BookOpenCheck },
}
