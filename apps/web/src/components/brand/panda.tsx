import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Faldo, the panda. These files are the official Canva artworks, only cropped to each pose (bamboo and
 * wave are single artworks, the rest come from the pose sheet). Colour comes from the designer's
 * 2000px export and transparency from the designer's transparent export of the same design, so the
 * poses stay sharp at large sizes. Never redraw, recolour, retouch or cut them out again.
 */
export const PANDA_POSES = {
  bamboo: { width: 1068, height: 1200, alt: "Faldo the panda holding bamboo" },
  wave: { width: 1176, height: 1200, alt: "Faldo the panda waving" },
  happy: { width: 581, height: 625, alt: "Faldo the panda cheering" },
  munch: { width: 605, height: 665, alt: "Faldo the panda eating bamboo" },
  resting: { width: 672, height: 481, alt: "Faldo the panda resting" },
  ramen: { width: 559, height: 657, alt: "Faldo the panda eating ramen" },
  cozy: { width: 764, height: 545, alt: "Faldo the panda hugging a pillow" },
  boba: { width: 543, height: 594, alt: "Faldo the panda drinking milk tea" },
  backpack: { width: 551, height: 600, alt: "Faldo the panda carrying bamboo" },
  sleep: { width: 718, height: 525, alt: "Faldo the panda asleep" },
  box: { width: 620, height: 541, alt: "Faldo the panda in a box" },
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
      <Image src={`/brand/panda/${pose}.png`} width={art.width} height={art.height} sizes={sizes} priority={priority} quality={90}
        alt={decorative ? "" : art.alt} draggable={false}
        className={cn("block h-auto w-full select-none", muted && "opacity-35 grayscale")} />
    </span>
  )
}
