import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Faldo, the panda. These files are the official Canva artworks, exported by the designer with a
 * transparent background and only cropped to each pose (bamboo and wave are single artworks, the
 * rest come from the pose sheet). Never redraw, recolour, retouch or cut them out again.
 */
export const PANDA_POSES = {
  bamboo: { width: 856, height: 961, alt: "Faldo the panda holding bamboo" },
  wave: { width: 991, height: 1011, alt: "Faldo the panda waving" },
  happy: { width: 316, height: 340, alt: "Faldo the panda cheering" },
  munch: { width: 329, height: 360, alt: "Faldo the panda eating bamboo" },
  resting: { width: 365, height: 261, alt: "Faldo the panda resting" },
  ramen: { width: 304, height: 357, alt: "Faldo the panda eating ramen" },
  cozy: { width: 415, height: 295, alt: "Faldo the panda hugging a pillow" },
  boba: { width: 295, height: 321, alt: "Faldo the panda drinking milk tea" },
  backpack: { width: 300, height: 325, alt: "Faldo the panda carrying bamboo" },
  sleep: { width: 389, height: 284, alt: "Faldo the panda asleep" },
  box: { width: 336, height: 294, alt: "Faldo the panda in a box" },
} as const

export type PandaPose = keyof typeof PANDA_POSES

export function Panda({ pose, className, priority, sizes = "160px", decorative = true, muted = false }: {
  pose: PandaPose
  className?: string
  priority?: boolean
  /** The rendered width, so the optimizer serves a right-sized file. */
  sizes?: string
  /** Most placements are decorative; pass false where the panda carries meaning. */
  decorative?: boolean
  /** Greyed out, for locked rewards. */
  muted?: boolean
}) {
  const art = PANDA_POSES[pose]
  return (
    <span className={cn("relative inline-block shrink-0 align-bottom", className)}>
      <Image src={`/brand/panda/${pose}.png`} width={art.width} height={art.height} sizes={sizes} priority={priority}
        alt={decorative ? "" : art.alt} draggable={false}
        className={cn("block h-auto w-full select-none", muted && "opacity-35 grayscale")} />
    </span>
  )
}
