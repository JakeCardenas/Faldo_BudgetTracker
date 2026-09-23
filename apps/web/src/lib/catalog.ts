import type { PandaPose } from "@/components/brand/panda"

/**
 * Faldo's poses, in the order the Streaks page shows them. The ids are the backend's (they began as outfits); each is
 * one of the canonical panda artworks, shown on Home. The hints match what unlocks them (`OUTFITS` in the API).
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
