import { cn } from "@/lib/utils"

/**
 * Faldo's green band (Home, Wallet, the empty Home and its loading state): a clean diagonal green with a little depth
 * at the bottom, and a quiet bamboo grove at the right edge. Sign-in uses the light mint version.
 */
export const BAND_STYLE: React.CSSProperties = {
  backgroundImage: [
    "radial-gradient(70% 60% at 0% 100%, rgb(0 0 0 / 0.18), transparent 70%)",
    "linear-gradient(160deg, #17462c, #2f7a4c)",
  ].join(","),
}

/** The band's green at the top, for the strip under the iPhone status bar (see StatusBarTint). */
export const BAND_TINT = "#1a4c30"

/** The light mint environment used on sign-in: pass with the `faldo-env` class, which handles dark mode. */
export const LIGHT_ENVIRONMENT = {
  "--env-l1": "#dbebdf", "--env-l2": "#eef5ef", "--env-l3": "#fbfcfa",
  "--env-d1": "#16301f", "--env-d2": "#0f1c14", "--env-d3": "#0c120e",
} as React.CSSProperties

/*
  Bamboo, drawn as one flat, faint silhouette: jointed culms (each joint a slight ridge with a thin line above it, and
  a soft highlight down each stem), thin twigs at the joints, and slender pointed leaves hanging in sprays toward the
  middle of the band. Drawn for the right edge at 1 unit per pixel and anchored to the band's bottom, so it keeps its
  size on every band and runs off the top of short ones.
*/

type Culm = {
  x: number
  w: number
  /** Joints: the first this far above the bottom, then one every `every`. */
  from: number
  every: number
  back?: boolean
  /** Leaf sprays at these joints (counted from the bottom), reaching toward the middle of the band. */
  sprays?: { at: number; size?: number }[]
}

const H = 840
const W = 150

const GROVE: Culm[] = [
  { x: 114, w: 7, from: 60, every: 78, back: true, sprays: [{ at: 4, size: 0.8 }, { at: 7, size: 0.75 }] },
  { x: 126, w: 11, from: 42, every: 86, sprays: [{ at: 3 }, { at: 5, size: 0.9 }] },
  { x: 141, w: 12, from: 16, every: 94, sprays: [{ at: 2, size: 1.1 }, { at: 7, size: 0.95 }] },
]

/** A bamboo leaf pointing along +x: rounded at the base, widest near a third of the way, drawn out to a fine tip. */
const leaf = (l: number) => `M0 0C${l * 0.22} ${-l * 0.1} ${l * 0.6} ${-l * 0.085} ${l} 0C${l * 0.6} ${l * 0.06} ${l * 0.22} ${l * 0.085} 0 0Z`

// A spray, pointing along +x: a twig rising from the joint, leaves fanned and drooping from its tip, two along it.
// Each leaf is [x, y, angle (degrees, clockwise), length].
const SPRAY: [number, number, number, number][] = [
  [28, -13, -30, 40], [28, -13, -6, 54], [28, -13, 20, 60], [28, -13, 46, 56], [28, -13, 74, 44],
  [13, -8, 100, 38], [13, -8, -58, 32],
]

function joints({ from, every }: Culm) {
  const ys: number[] = []
  for (let d = from; d < H; d += every) ys.push(H - d)
  return ys
}

function Stem({ culm }: { culm: Culm }) {
  const { x, w } = culm
  const ys = joints(culm)
  const edges = [H + 4, ...ys, -4]
  return (
    <>
      {edges.slice(0, -1).map((bottom, i) => {
        const top = edges[i + 1] + 1.8
        return <rect key={bottom} x={x} y={top} width={w} height={bottom - 3 - top} rx={1.5} />
      })}
      {ys.map((y) => <rect key={y} x={x - 1.2} y={y - 1.8} width={w + 2.4} height={3.6} rx={1.8} />)}
      {culm.sprays?.map(({ at, size = 1 }) => ys[at] !== undefined && (
        <g key={at} transform={`translate(${x} ${ys[at]}) scale(${-size} ${size})`}>
          <path d="M0 0q12-10 28-13" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
          {SPRAY.map(([lx, ly, angle, l]) => <path key={`${angle}${l}`} d={leaf(l)} transform={`translate(${lx} ${ly}) rotate(${angle})`} />)}
        </g>
      ))}
    </>
  )
}

/** The light down one side of each stem, between the joints, so it reads round. */
function Shine({ culm }: { culm: Culm }) {
  const { x, w } = culm
  const edges = [H + 4, ...joints(culm), -4]
  return (
    <>
      {edges.slice(0, -1).map((bottom, i) => {
        const top = edges[i + 1] + 5
        return <rect key={bottom} x={x + w * 0.2} y={top} width={Math.max(1.5, w * 0.16)} height={Math.max(0, bottom - 6 - top)} rx={1} />
      })}
    </>
  )
}

/**
 * A quiet bamboo grove at the right edge of a band, white on the green (or green on light surfaces). It sets the
 * scene without competing with the numbers: the culms stay at the edge and only leaf tips reach in, into open space.
 */
export function BambooDecor({ tone = "onGreen", className }: { tone?: "onGreen" | "onLight"; className?: string }) {
  const light = tone === "onLight"
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden fill="currentColor"
      className={cn("pointer-events-none absolute right-0 bottom-0 -z-10 h-[52.5rem] w-[9.375rem]", light ? "text-primary" : "text-white", className)}>
      <g opacity={light ? 0.04 : 0.06}>{GROVE.filter((c) => c.back).map((c) => <Stem key={c.x} culm={c} />)}</g>
      <g opacity={light ? 0.07 : 0.12}>{GROVE.filter((c) => !c.back).map((c) => <Stem key={c.x} culm={c} />)}</g>
      <g opacity={light ? 0.03 : 0.07}>{GROVE.filter((c) => !c.back).map((c) => <Shine key={c.x} culm={c} />)}</g>
    </svg>
  )
}
