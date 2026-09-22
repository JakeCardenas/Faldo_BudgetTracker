import Image from "next/image"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

interface Art {
  width: number
  height: number
  alt: string
  /** Where the pose's effects (the ?, zzz, sparkles, hearts…) sit, in % of the art: x0, y0, x1, y1. They animate on their own layer. */
  fx?: readonly [number, number, number, number]
}

/**
 * Faldo's reactions in Ask Faldo: one pose for each kind of answer (plenty of budget left, running low,
 * over budget, a bill, a goal reached…). The rest of the app keeps the app logo. Cut from the designer's
 * transparent pose sheet, keeping its own alpha, only cropped and with the caption pills removed; poses
 * with effects also come as a body layer and an effects layer so the two can move separately. Never
 * redraw, recolour or retouch them.
 */
export const FALDO_MOODS = {
  happy: { width: 246, height: 296, alt: "Faldo the panda smiling", fx: [4.9, 45.3, 92.7, 67.9] },
  wave: { width: 253, height: 244, alt: "Faldo the panda waving", fx: [86.2, 20.5, 96, 32.8] },
  thinking: { width: 241, height: 277, alt: "Faldo the panda thinking", fx: [78.4, 17.3, 90.9, 35.4] },
  celebrate: { width: 257, height: 256, alt: "Faldo the panda celebrating", fx: [7.8, 3.5, 96.1, 89.8] },
  sleepy: { width: 254, height: 285, alt: "Faldo the panda asleep", fx: [57.1, 20.4, 81.5, 40] },
  money: { width: 279, height: 262, alt: "Faldo the panda holding money", fx: [11.8, 33.2, 91, 61.1] },
  chart: { width: 241, height: 247, alt: "Faldo the panda checking a chart", fx: [81.7, 23.1, 95, 38.9] },
  food: { width: 231, height: 273, alt: "Faldo the panda eating noodles" },
  phone: { width: 251, height: 242, alt: "Faldo the panda using a phone", fx: [82.5, 36, 91.2, 57.9] },
  love: { width: 231, height: 268, alt: "Faldo the panda hugging a heart", fx: [7.4, 31, 95.7, 64.2] },
  shopping: { width: 276, height: 262, alt: "Faldo the panda carrying shopping bags" },
  motivated: { width: 237, height: 260, alt: "Faldo the panda in a headband, ready to go", fx: [9.7, 35.8, 93.2, 77.3] },
  surprised: { width: 257, height: 259, alt: "Faldo the panda surprised", fx: [74.7, 13.1, 87.9, 35.5] },
  idea: { width: 262, height: 263, alt: "Faldo the panda with an idea", fx: [80.5, 37.3, 92, 58.6] },
  wallet: { width: 230, height: 257, alt: "Faldo the panda holding a wallet" },
  goal: { width: 268, height: 251, alt: "Faldo the panda holding a goal flag", fx: [17.2, 46.2, 24.6, 55.8] },
  warning: { width: 261, height: 265, alt: "Faldo the panda holding a warning sign", fx: [79.3, 38.1, 88.9, 56.2] },
  camera: { width: 249, height: 257, alt: "Faldo the panda holding a camera", fx: [76.7, 39.7, 87.6, 58] },
  receipt: { width: 232, height: 257, alt: "Faldo the panda reading a receipt" },
  profile: { width: 188, height: 245, alt: "Faldo the panda in a hoodie" },
} as const satisfies Record<string, Art>

export type FaldoMood = keyof typeof FALDO_MOODS

type BodyMotion = "breathe" | "sway" | "bounce" | "tilt" | "shake" | "jump" | "doze"
type FxMotion = "bob" | "float" | "twinkle" | "burst" | "pulse" | "flash" | "rise" | "pop"

/** How each pose moves: the body's gesture and what its effects do (the ? bobs, the zzz drift up, sparkles twinkle…). */
const MOTION: Record<FaldoMood, { body: BodyMotion; fx?: FxMotion }> = {
  happy: { body: "breathe", fx: "flash" },
  wave: { body: "sway", fx: "flash" },
  thinking: { body: "tilt", fx: "bob" },
  celebrate: { body: "bounce", fx: "burst" },
  sleepy: { body: "doze", fx: "float" },
  money: { body: "bounce", fx: "twinkle" },
  chart: { body: "breathe", fx: "rise" },
  food: { body: "breathe" },
  phone: { body: "breathe", fx: "flash" },
  love: { body: "breathe", fx: "pulse" },
  shopping: { body: "sway" },
  motivated: { body: "bounce", fx: "twinkle" },
  surprised: { body: "jump", fx: "pop" },
  idea: { body: "breathe", fx: "flash" },
  wallet: { body: "breathe" },
  goal: { body: "sway", fx: "twinkle" },
  warning: { body: "shake", fx: "flash" },
  camera: { body: "breathe", fx: "flash" },
  receipt: { body: "breathe" },
  profile: { body: "breathe" },
}

/** The pose itself, as one image or as a body with its effects layered on top. */
function FaldoArt({ mood, animated, sizes, priority, label }: { mood: FaldoMood; animated: boolean; sizes: string; priority?: boolean; label?: string }) {
  const art: Art = FALDO_MOODS[mood]
  const motion = MOTION[mood]
  const fx = art.fx
  const origin: CSSProperties | undefined = fx && {
    transformOrigin: `${(fx[0] + fx[2]) / 2}% ${motion.fx === "rise" ? fx[3] : (fx[1] + fx[3]) / 2}%`,
  }
  return (
    <span className="relative block" data-body={animated ? motion.body : undefined} data-fx={animated && fx ? motion.fx : undefined}>
      <Image src={`/brand/faldo/${mood}${fx ? "-body" : ""}.png`} width={art.width} height={art.height} sizes={sizes} priority={priority}
        quality={90} alt={label ?? ""} draggable={false} className="faldo-body block h-auto w-full select-none" />
      {fx && (
        <Image src={`/brand/faldo/${mood}-fx.png`} width={art.width} height={art.height} sizes={sizes} priority={priority} quality={90}
          alt="" draggable={false} style={origin} className="faldo-fx pointer-events-none absolute inset-0 size-full select-none" />
      )}
    </span>
  )
}

export function Faldo({ mood, className, priority, sizes = "160px", label, animated = true }: {
  mood: FaldoMood
  className?: string
  priority?: boolean
  /** The rendered width, so the optimizer serves a right-sized file. */
  sizes?: string
  /** What the pose means here, for screen readers; decorative when left out. */
  label?: string
  /** Keep moving: the ? bobs, sparkles twinkle, the body sways. */
  animated?: boolean
}) {
  return (
    <span key={mood} className={cn("faldo-pop relative inline-block shrink-0 align-bottom", className)}>
      <FaldoArt mood={mood} animated={animated} sizes={sizes} priority={priority} label={label} />
    </span>
  )
}

/** Faldo in a round frame: his face on each chat reply, moving while it's the latest one. */
export function FaldoAvatar({ mood = "happy", className, sizes = "48px", label, animated = false }: {
  mood?: FaldoMood
  className?: string
  sizes?: string
  label?: string
  animated?: boolean
}) {
  return (
    <span className={cn("relative block size-10 shrink-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_30%,#e8f5eb,#cde8d4)] dark:bg-[radial-gradient(circle_at_50%_30%,#2c4a36,#1d3526)]", className)}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span key={mood} className="faldo-pop absolute top-[5%] left-0 block w-full">
        <FaldoArt mood={mood} animated={animated} sizes={sizes} />
      </span>
    </span>
  )
}
