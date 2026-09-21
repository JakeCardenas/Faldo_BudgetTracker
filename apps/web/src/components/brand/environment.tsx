import { environmentFor } from "@/lib/catalog"
import { cn } from "@/lib/utils"

/**
 * Faldo's environment: pass these as the element's style together with the `faldo-env` class.
 * The class switches between the light and dark tints of the chosen theme.
 */
export function environmentStyle(id?: string | null): React.CSSProperties {
  const env = environmentFor(id)
  return {
    "--env-l1": env.light[0], "--env-l2": env.light[1], "--env-l3": env.light[2],
    "--env-d1": env.dark[0], "--env-d2": env.dark[1], "--env-d3": env.dark[2],
  } as React.CSSProperties
}

/**
 * A quiet bamboo motif: a couple of stalks and leaves in Faldo green at very low opacity. It sets the scene
 * without competing with the numbers; never place it behind text.
 */
export function BambooDecor({ className, side = "right" }: { className?: string; side?: "left" | "right" }) {
  return (
    <svg viewBox="0 0 160 420" aria-hidden className={cn("pointer-events-none text-primary", side === "left" && "-scale-x-100", className)} fill="currentColor">
      <g opacity="0.07">
        <rect x="92" y="0" width="16" height="420" rx="8" />
        <rect x="90" y="96" width="20" height="5" rx="2.5" />
        <rect x="90" y="214" width="20" height="5" rx="2.5" />
        <rect x="90" y="330" width="20" height="5" rx="2.5" />
        <path d="M108 104c22-4 40-18 52-40-26 2-44 16-52 40z" />
        <path d="M108 222c18 2 34 12 46 28-22 2-38-8-46-28z" />
        <path d="M92 150c-20-6-34-20-42-40 22 4 36 18 42 40z" />
      </g>
      <g opacity="0.045">
        <rect x="40" y="60" width="11" height="360" rx="5.5" />
        <rect x="38" y="170" width="15" height="4" rx="2" />
        <rect x="38" y="290" width="15" height="4" rx="2" />
        <path d="M40 178c-16-2-30-12-38-28 18 0 32 10 38 28z" />
      </g>
    </svg>
  )
}
