import {
  BookOpenCheck, CalendarCheck, CalendarClock, CalendarDays, Calculator, Crown, Dumbbell, Flag, Flame, Medal, MessageCircle, ReceiptText, Sprout, Target,
  type LucideIcon,
} from "lucide-react"

export const OUTFIT_INFO: Record<string, { name: string; hint: string }> = {
  classic: { name: "Classic", hint: "Always available" },
  bucket_hat: { name: "Bucket hat", hint: "Keep a 3-day streak" },
  scarf: { name: "Cozy scarf", hint: "Keep a 7-day streak" },
  headphones: { name: "Headphones", hint: "Ask Faldo a question" },
  flower_crown: { name: "Flower crown", hint: "Create a savings goal" },
  grad_cap: { name: "Graduation cap", hint: "Finish 3 lessons" },
  shades: { name: "Cool shades", hint: "Keep a 14-day streak" },
  crown: { name: "Golden crown", hint: "Keep a 30-day streak" },
}

export const BACKGROUND_INFO: Record<string, { name: string; hint: string }> = {
  meadow: { name: "Leafy green", hint: "Always available" },
  sunrise: { name: "Lake sunrise", hint: "Log two days in a row" },
  terraces: { name: "Rice terraces", hint: "Keep a 7-day streak" },
  lagoon: { name: "Island lagoon", hint: "Set up a budget" },
  hills: { name: "Rolling hills", hint: "Keep a 14-day streak" },
  bay_sunset: { name: "Bay sunset", hint: "Track a recurring bill" },
  night_market: { name: "Night market", hint: "Keep a 30-day streak" },
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
