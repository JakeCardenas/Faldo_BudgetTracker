import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Faldo, the canonical panda. These are the official artworks, only cut out of their white
 * backgrounds; never redraw, recolour or restyle them. Pick the pose that fits the moment.
 */
export const PANDA_POSES = {
  bamboo: { width: 711, height: 800, alt: "Faldo the panda holding bamboo" },
  wave: { width: 746, height: 800, alt: "Faldo the panda waving" },
  happy: { width: 800, height: 634, alt: "Faldo the panda lying down, smiling" },
  munch: { width: 335, height: 406, alt: "Faldo the panda eating bamboo" },
  resting: { width: 410, height: 291, alt: "Faldo the panda resting" },
  ramen: { width: 340, height: 401, alt: "Faldo the panda eating ramen" },
  cozy: { width: 469, height: 332, alt: "Faldo the panda hugging a pillow" },
  boba: { width: 301, height: 359, alt: "Faldo the panda drinking milk tea" },
  backpack: { width: 335, height: 364, alt: "Faldo the panda carrying bamboo" },
  sleep: { width: 440, height: 278, alt: "Faldo the panda asleep" },
  box: { width: 376, height: 328, alt: "Faldo the panda in a box" },
} as const

export type PandaPose = keyof typeof PANDA_POSES

export function Panda({ pose, className, priority, sizes = "160px", decorative = true }: {
  pose: PandaPose
  className?: string
  priority?: boolean
  /** The rendered width, so the optimizer serves a right-sized file. */
  sizes?: string
  /** Most placements are decorative; pass false where the panda carries meaning. */
  decorative?: boolean
}) {
  const art = PANDA_POSES[pose]
  return (
    <Image src={`/brand/panda/${pose}.png`} width={art.width} height={art.height} sizes={sizes} priority={priority}
      alt={decorative ? "" : art.alt} draggable={false}
      className={cn("h-auto select-none", className)} />
  )
}
