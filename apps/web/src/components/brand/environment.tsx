import { environmentFor } from "@/lib/catalog"
import { cn } from "@/lib/utils"

/**
 * Faldo's green bamboo environment for the Home hero, from the theme the person picked: a clean
 * diagonal green with a little depth at the bottom. No glow at the top.
 */
export function environmentStyle(id?: string | null): React.CSSProperties {
  const env = environmentFor(id)
  return {
    backgroundImage: [
      "radial-gradient(70% 60% at 0% 100%, rgb(0 0 0 / 0.18), transparent 70%)",
      `linear-gradient(160deg, ${env.from}, ${env.to})`,
    ].join(","),
  }
}

/** The light mint environment used on sign-in: pass with the `faldo-env` class, which handles dark mode. */
export const LIGHT_ENVIRONMENT = {
  "--env-l1": "#dbebdf", "--env-l2": "#eef5ef", "--env-l3": "#fbfcfa",
  "--env-d1": "#16301f", "--env-d2": "#0f1c14", "--env-d3": "#0c120e",
} as React.CSSProperties

/**
 * A quiet bamboo motif: a couple of stalks and leaves at low opacity, white on the green environment or
 * green on light surfaces. It sets the scene without competing with the numbers; never place it behind text.
 */
export function BambooDecor({ className, side = "right", tone = "onGreen" }: { className?: string; side?: "left" | "right"; tone?: "onGreen" | "onLight" }) {
  const light = tone === "onLight"
  return (
    <svg viewBox="0 0 160 420" aria-hidden className={cn("pointer-events-none", light ? "text-primary" : "text-white", side === "left" && "-scale-x-100", className)} fill="currentColor">
      <g opacity={light ? 0.07 : 0.1}>
        <rect x="92" y="0" width="16" height="420" rx="8" />
        <rect x="90" y="96" width="20" height="5" rx="2.5" />
        <rect x="90" y="214" width="20" height="5" rx="2.5" />
        <rect x="90" y="330" width="20" height="5" rx="2.5" />
        <path d="M108 104c22-4 40-18 52-40-26 2-44 16-52 40z" />
        <path d="M108 222c18 2 34 12 46 28-22 2-38-8-46-28z" />
        <path d="M92 150c-20-6-34-20-42-40 22 4 36 18 42 40z" />
      </g>
      <g opacity={light ? 0.045 : 0.06}>
        <rect x="40" y="60" width="11" height="360" rx="5.5" />
        <rect x="38" y="170" width="15" height="4" rx="2" />
        <rect x="38" y="290" width="15" height="4" rx="2" />
        <path d="M40 178c-16-2-30-12-38-28 18 0 32 10 38 28z" />
      </g>
    </svg>
  )
}
