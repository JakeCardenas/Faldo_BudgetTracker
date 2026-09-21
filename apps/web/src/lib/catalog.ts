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

/**
 * Unlockable environments for the Home hero: a clean off-white base with a light tint that fades
 * toward near-white where Faldo sits (so his white fur stays white). Each has a dark-mode version.
 */
type Tint = [string, string, string]
export const BACKGROUND_INFO: Record<string, { name: string; hint: string; light: Tint; dark: Tint }> = {
  meadow: { name: "Bamboo grove", hint: "Always available", light: ["#dbebdf", "#eef5ef", "#fbfcfa"], dark: ["#16301f", "#0f1c14", "#0c120e"] },
  sunrise: { name: "Morning light", hint: "Log two days in a row", light: ["#f2e7cf", "#f4f3e9", "#fcfcf8"], dark: ["#2b2917", "#171a10", "#0e110d"] },
  terraces: { name: "Rice terraces", hint: "Keep a 7-day streak", light: ["#e0ecca", "#f0f5e6", "#fbfcf8"], dark: ["#223018", "#141c10", "#0d120c"] },
  lagoon: { name: "Island lagoon", hint: "Set up a budget", light: ["#d3ebe5", "#ebf5f2", "#fafcfb"], dark: ["#10302a", "#0d1c19", "#0b1210"] },
  hills: { name: "Highlands", hint: "Keep a 14-day streak", light: ["#dde9e1", "#eef3ef", "#fbfcfb"], dark: ["#1a2b21", "#111a15", "#0c110e"] },
  bay_sunset: { name: "Golden hour", hint: "Track a recurring bill", light: ["#f2e0d0", "#f5efe7", "#fcfbf9"], dark: ["#2f2219", "#1a1611", "#0f0e0c"] },
  night_market: { name: "Night grove", hint: "Keep a 30-day streak", light: ["#dce3e8", "#edf0f2", "#fafbfc"], dark: ["#111b22", "#0d1418", "#0b0f12"] },
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
