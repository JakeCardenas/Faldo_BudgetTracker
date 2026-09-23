"use client"

import Image from "next/image"
import { useId } from "react"
import { skyFor } from "@/components/brand/environment"
import { cn } from "@/lib/utils"

/*
  The scenery on Faldo's bands. His home is a pixel-art bamboo valley (an image, see BambooValley). The rewards are
  postcards of landmarks across Asia, drawn in soft watercolour over misty painted land. The greeting, Faldo's note
  and the numbers stay readable over each, and nothing moves.
*/

type Pt = [number, number]

/** A ridge through the points, each joined to the next with a smooth curve, filled down to the bottom of the box. */
function ridge(points: Pt[], width: number, height: number) {
  let d = `M0 ${height}L${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const cx = (x0 + x1) / 2
    d += `C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`
  }
  return `${d}L${width} ${height}Z`
}

/** Peaks as `[x, height]` pairs across a 1200-wide strip, each rising from a low saddle. */
function peaks(list: [number, number][], base: number, spread = 44) {
  const pts: Pt[] = [[0, base]]
  for (const [x, h] of list) pts.push([x - spread, base - h * 0.4], [x, base - h], [x + spread, base - h * 0.4])
  pts.push([1200, base])
  return pts
}

function VGrad({ id, stops }: { id: string; stops: [number, string, number?][] }) {
  return <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">{stops.map(([o, c, a = 1]) => <stop key={o} offset={o} stopColor={c} stopOpacity={a} />)}</linearGradient>
}

function HGrad({ id, stops }: { id: string; stops: [number, string][] }) {
  return <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">{stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}</linearGradient>
}

/** Watercolour: edges pushed around by noise, then softened, like pigment spreading on wet paper. */
function WetEdge({ id, scale = 12, blur = 1.2, seed = 4 }: { id: string; scale?: number; blur?: number; seed?: number }) {
  return (
    <filter id={id} x="-5%" y="-10%" width="110%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="3" seed={seed} />
      <feDisplacementMap in="SourceGraphic" scale={scale} xChannelSelector="R" yChannelSelector="G" />
      <feGaussianBlur stdDeviation={blur} />
    </filter>
  )
}

/**
 * Mountain washes across the band's full width, back to front: each is darkest along its ridge and bleeds into the
 * mist below, with a wet edge.
 */
function Washes({ layers, className }: { layers: { points: Pt[]; color: string; fade?: number }[]; className: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 w-full", className)}>
      <defs>
        {layers.map((l, i) => <VGrad key={i} id={`${id}${i}`} stops={[[0, l.color, 0.95], [l.fade ?? 0.7, l.color, 0.12], [1, l.color, 0]]} />)}
        <WetEdge id={`${id}w`} />
      </defs>
      {layers.map((l, i) => <path key={i} d={ridge(l.points, 1200, 300)} fill={`url(#${id}${i})`} filter={`url(#${id}w)`} />)}
    </svg>
  )
}

/** Solid painted ground along the bottom, lit along its top edge: where Faldo sits. */
function Ground({ points, top, bottom, rim, className }: { points: Pt[]; top: string; bottom: string; rim?: string; className: string }) {
  const id = useId()
  const d = ridge(points, 1200, 300)
  return (
    <svg viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 w-full", className)}>
      <defs><VGrad id={`${id}g`} stops={[[0, top], [1, bottom]]} /><WetEdge id={`${id}w`} scale={6} blur={0.6} seed={9} /></defs>
      <path d={d} fill={`url(#${id}g)`} filter={`url(#${id}w)`} />
      {rim && <path d={d.replace(/L1200 300Z$/, "").replace(/^M0 300L/, "M")} fill="none" stroke={rim} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

/** Water across the bottom, with a few soft streaks of light. */
function Water({ top, bottom, className }: { top: string; bottom: string; className: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 block", className)}
      style={{ backgroundImage: `repeating-linear-gradient(180deg, transparent 0 7px, rgb(255 255 255 / 0.14) 7px 8px), linear-gradient(180deg, ${top}, ${bottom})` }} />
  )
}

function Mist({ className }: { className: string }) {
  return <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 block h-24 bg-[linear-gradient(to_bottom,transparent,rgb(246_251_246/0.55)_50%,transparent)] blur-xl", className)} />
}

/** A faint paper grain over the painting. */
function Grain() {
  const id = useId()
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14] mix-blend-soft-light">
      <filter id={`${id}n`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter={`url(#${id}n)`} />
    </svg>
  )
}

/** A puffy cloud built from shaded puffs, each lit from the top left, over a soft shaded base. */
function Cloud({ theme, className }: { theme?: string | null; className: string }) {
  const id = useId()
  const sky = skyFor(theme)
  const puffs: [number, number, number][] = [[34, 54, 20], [60, 42, 27], [92, 36, 30], [124, 46, 24], [148, 56, 16]]
  return (
    <svg viewBox="0 0 170 80" aria-hidden className={cn("pointer-events-none absolute drop-shadow-[0_8px_12px_rgb(20_40_60/0.12)]", className)}>
      <defs>
        <radialGradient id={`${id}p`} cx="0.42" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#ffffff" /><stop offset="0.55" stopColor={sky.cloud} /><stop offset="1" stopColor={sky.cloudShade} />
        </radialGradient>
        <VGrad id={`${id}b`} stops={[[0, sky.cloud], [1, sky.cloudShade]]} />
        <WetEdge id={`${id}w`} scale={4} blur={0.5} seed={2} />
      </defs>
      <g filter={`url(#${id}w)`}>
        <ellipse cx="90" cy="62" rx="78" ry="14" fill={`url(#${id}b)`} />
        {puffs.map(([cx, cy, r]) => <circle key={cx} cx={cx} cy={cy} r={r} fill={`url(#${id}p)`} />)}
      </g>
    </svg>
  )
}

/* Watercolour bamboo: slender culms in a light green wash with darker joints, and leaves as tapered strokes, dark at
   the base and lighter to the tip, hanging in sprays and overlapping like layers of paint. */

type Culm = { x: number; w: number; top?: number; every: number; offset?: number; sprays?: { node: number; side: "left" | "right"; size?: number; tone?: 0 | 1 | 2 }[] }

const LEAF_TONES: [string, string][] = [["#2d6a44", "#79b56a"], ["#3f7f52", "#9ccc84"], ["#5f9a6e", "#bfdcaa"]]

function Bamboo({ culms, className, mirror, hazy }: { culms: Culm[]; className: string; mirror?: boolean; hazy?: boolean }) {
  const id = useId()
  const H = 600
  const leaf = (l: number) => `M0 0C${l * 0.2} ${-l * 0.075} ${l * 0.6} ${-l * 0.085} ${l} ${l * 0.015}C${l * 0.6} ${l * 0.06} ${l * 0.2} ${l * 0.07} 0 0Z`
  return (
    <svg viewBox={`0 0 220 ${H}`} preserveAspectRatio="xMidYMax meet" aria-hidden
      className={cn("pointer-events-none absolute", mirror && "-scale-x-100", hazy && "opacity-50 blur-[1.5px]", className)}>
      <defs>
        <HGrad id={`${id}c`} stops={[[0, "#4f8a55"], [0.3, "#8fc07a"], [0.5, "#b9dca0"], [0.75, "#86b872"], [1, "#4a8150"]]} />
        {LEAF_TONES.map(([base, tip], i) => (
          <linearGradient key={i} id={`${id}l${i}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={base} /><stop offset="1" stopColor={tip} /></linearGradient>
        ))}
        <WetEdge id={`${id}w`} scale={3} blur={0.35} seed={11} />
      </defs>
      <g filter={`url(#${id}w)`}>
        {culms.map(({ x, w, top = 0, every, offset = 0, sprays = [] }) => {
          const joints: number[] = []
          for (let y = top + offset + every; y < H - 4; y += every) joints.push(y)
          const edges = [top, ...joints, H]
          return (
            <g key={x}>
              {edges.slice(0, -1).map((y0, i) => (
                <rect key={y0} x={x} y={y0 + 2} width={w} height={edges[i + 1] - y0 - 3} rx={w * 0.25} fill={`url(#${id}c)`} opacity={0.95} />
              ))}
              {joints.map((y) => <path key={y} d={`M${x - 1.5} ${y + 1}q${w / 2 + 1.5} -4 ${w + 3} 0`} fill="none" stroke="#3a6e44" strokeWidth={1.8} strokeLinecap="round" />)}
              {sprays.map(({ node, side, size = 1, tone = 0 }) => {
                const y = joints[node]
                if (y === undefined) return null
                const dir = side === "right" ? 1 : -1
                const bx = side === "right" ? x + w : x
                const fan: [number, number, number, number][] = [[28, -6, 8, 74], [28, -6, 30, 70], [28, -6, 52, 62], [22, -5, -12, 60], [28, -6, 74, 50], [16, -4, 18, 56]]
                return (
                  <g key={`${node}${side}`} transform={`translate(${bx} ${y}) scale(${dir * size} ${size})`}>
                    <path d="M0 0q14 -8 28 -6" fill="none" stroke="#4f7f4a" strokeWidth={1.5} strokeLinecap="round" />
                    {fan.map(([tx, ty, a, l], i) => (
                      <path key={a} d={leaf(l)} transform={`translate(${tx} ${ty}) rotate(${a})`}
                        fill={`url(#${id}l${(tone + (i % 2)) % 3})`} opacity={i === 3 ? 0.55 : 0.88} />
                    ))}
                  </g>
                )
              })}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

/* Landmarks: watercolour postcards on a 300×200 canvas, base at the bottom, lit from their sky's sun. */

function Postcard({ children, className }: { children: React.ReactNode; className: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 300 200" aria-hidden className={cn("pointer-events-none absolute", className)}>
      <defs><WetEdge id={`${id}w`} scale={3.5} blur={0.3} seed={3} /></defs>
      <g filter={`url(#${id}w)`}>{children}</g>
    </svg>
  )
}

function Mayon({ className }: { className: string }) {
  const id = useId()
  return (
    <Postcard className={className}>
      <defs>
        <HGrad id={`${id}v`} stops={[[0, "#56687e"], [0.42, "#8497ab"], [0.56, "#bccad5"], [0.72, "#9aaec0"], [1, "#62758a"]]} />
        <VGrad id={`${id}g`} stops={[[0, "#7cb35f"], [1, "#4f8f3e"]]} />
      </defs>
      <path d="M8 200C78 178 118 116 140 40Q150 28 160 40C182 116 222 178 292 200Z" fill={`url(#${id}v)`} />
      {[110, 136, 168, 196].map((x1) => <path key={x1} d={`M150 42Q${(150 + x1) / 2 + 2} 106 ${x1} ${x1 === 110 || x1 === 196 ? 172 : 181}`} fill="none" stroke="#dbe3ea" strokeWidth={1.2} opacity={0.45} />)}
      <path d="M8 200C70 186 110 164 132 152Q150 146 168 152C190 164 230 186 292 200Z" fill={`url(#${id}g)`} />
      <ellipse cx={156} cy={30} rx={16} ry={6} fill="#ffffff" opacity={0.7} />
      <ellipse cx={172} cy={24} rx={12} ry={5} fill="#ffffff" opacity={0.55} />
    </Postcard>
  )
}

function Palm({ className, flip }: { className: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 80 140" aria-hidden className={cn("pointer-events-none absolute", flip && "-scale-x-100", className)}>
      <path d="M40 140C38 110 40 80 50 46" fill="none" stroke="#5a4a36" strokeWidth={5} strokeLinecap="round" />
      {[[-150, 34], [-120, 38], [-70, 36], [-30, 34], [10, 30], [170, 30]].map(([a, l]) => (
        <path key={a} d={`M0 0q${l * 0.5} -${l * 0.18} ${l} ${l * 0.2}q-${l * 0.5} -${l * 0.05} -${l} -${l * 0.2}Z`} transform={`translate(50 46) rotate(${a})`} fill="#2f6a3a" />
      ))}
    </svg>
  )
}

function Banaue({ className }: { className: string }) {
  const id = useId()
  const bands = Array.from({ length: 10 }, (_, i) => 62 + i * 13)
  return (
    <Postcard className={className}>
      <defs>
        <clipPath id={`${id}h`}><path d="M0 200V70C50 46 110 44 160 64C210 84 250 120 300 138V200Z" /></clipPath>
        <VGrad id={`${id}t`} stops={[[0, "#9bd069"], [1, "#5f9e43"]]} />
      </defs>
      <path d="M0 200V70C50 46 110 44 160 64C210 84 250 120 300 138V200Z" fill="#4f8a3e" />
      <g clipPath={`url(#${id}h)`}>
        {bands.map((y, i) => (
          <g key={y}>
            <path d={`M-10 ${y}Q150 ${y - 16} 310 ${y + 10}V${y + 14}Q150 ${y - 2} -10 ${y + 12}Z`} fill={i % 3 === 1 ? "#8cc7d6" : `url(#${id}t)`} opacity={i % 3 === 1 ? 0.8 : 1} />
            <path d={`M-10 ${y}Q150 ${y - 16} 310 ${y + 10}`} fill="none" stroke="#5a4a32" strokeWidth={1.4} opacity={0.6} />
          </g>
        ))}
      </g>
      <g transform="translate(212 104)">
        <rect x={-1} y={0} width={1.6} height={12} fill="#4a3a28" /><rect x={9} y={0} width={1.6} height={12} fill="#4a3a28" />
        <rect x={-2} y={-4} width={14} height={5} fill="#7a5a3a" />
        <path d="M-6 -3L5 -18L16 -3Z" fill="#a37a44" />
      </g>
    </Postcard>
  )
}

function MarinaBay({ className }: { className: string }) {
  const id = useId()
  return (
    <Postcard className={className}>
      <defs>
        <HGrad id={`${id}g`} stops={[[0, "#8fa4b4"], [0.4, "#e8f0f4"], [0.6, "#c7d6e0"], [1, "#8ea3b3"]]} />
        <VGrad id={`${id}s`} stops={[[0, "#e9eef1"], [1, "#b8c6cf"]]} />
      </defs>
      {[108, 150, 192].map((x) => (
        <g key={x}>
          <path d={`M${x - 16} 186L${x - 12} 66H${x + 12}L${x + 16} 186Z`} fill={`url(#${id}g)`} />
          {Array.from({ length: 11 }, (_, i) => <rect key={i} x={x - 12} y={76 + i * 10} width={24} height={0.8} fill="#6f8797" opacity={0.35} />)}
        </g>
      ))}
      <path d="M82 60Q150 50 238 56L246 60Q244 66 236 66Q150 62 84 68Z" fill={`url(#${id}s)`} />
      {[[252, 150], [272, 138], [290, 156]].map(([x, y]) => (
        <g key={x}>
          <path d={`M${x - 2} 190L${x - 1} ${y}H${x + 1}L${x + 2} 190Z`} fill="#6a5a7e" />
          <path d={`M${x - 10} ${y}Q${x} ${y - 10} ${x + 10} ${y}Q${x} ${y + 3} ${x - 10} ${y}Z`} fill="#7a5f96" />
        </g>
      ))}
      <path d="M26 186Q34 164 42 186M38 186Q48 160 58 186M52 186Q60 166 68 186" fill="#f4f1ea" stroke="#d7d0c2" strokeWidth={0.8} />
    </Postcard>
  )
}

function Fuji({ className }: { className: string }) {
  const id = useId()
  return (
    <Postcard className={className}>
      <defs>
        <HGrad id={`${id}m`} stops={[[0, "#46628c"], [0.45, "#6f8bb3"], [0.62, "#9ab0cf"], [1, "#50698f"]]} />
        <HGrad id={`${id}s`} stops={[[0, "#dfe7f0"], [0.55, "#ffffff"], [1, "#e6edf5"]]} />
      </defs>
      <path d="M0 200C62 170 112 96 136 56Q150 44 164 56C188 96 238 170 300 200Z" fill={`url(#${id}m)`} />
      <path d="M136 56Q150 44 164 56C172 68 178 78 186 88L178 84L171 92L163 84L155 94L147 84L139 92L131 84L122 90C128 78 131 66 136 56Z" fill={`url(#${id}s)`} />
      <g transform="translate(62 0)">
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 184 - i * 16
          const w = 40 - i * 6
          return (
            <g key={i}>
              <rect x={-w / 2 + 4} y={y - 10} width={w - 8} height={10} fill="#c8412f" />
              <path d={`M${-w / 2 - 6} ${y - 10}Q0 ${y - 16} ${w / 2 + 6} ${y - 10}L${w / 2 - 2} ${y - 14}H${-w / 2 + 2}Z`} fill="#3d3a3a" />
            </g>
          )
        })}
        <rect x={-1} y={100} width={2} height={16} fill="#3d3a3a" />
      </g>
      {[[26, 176, 22], [96, 182, 16], [236, 180, 20], [272, 172, 24]].map(([x, y, r]) => (
        <g key={x}>
          <circle cx={x} cy={y} r={r} fill="#f4b7c8" />
          <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.55} fill="#fbd6e0" />
        </g>
      ))}
    </Postcard>
  )
}

function WatArun({ className }: { className: string }) {
  const id = useId()
  const prang = (cx: number, s: number) => (
    <g key={cx} transform={`translate(${cx} 190) scale(${s})`}>
      <path d="M-30 0L-26 -40L-20 -44L-18 -70L-12 -74L-10 -100L-6 -104L-4 -130C-3 -150 -1 -164 0 -176C1 -164 3 -150 4 -130L6 -104L10 -100L12 -74L18 -70L20 -44L26 -40L30 0Z" fill={`url(#${id}p)`} />
      {[-40, -70, -100, -130].map((y, i) => <rect key={y} x={-26 + i * 6} y={y} width={52 - i * 12} height={2.4} fill="#d9895c" opacity={0.8} />)}
      {[-56, -86, -116].map((y, i) => [-1, 0, 1].map((k) => <circle key={`${y}${k}`} cx={k * (14 - i * 3)} cy={y} r={1.6} fill="#5f9ab0" opacity={0.8} />))}
    </g>
  )
  return (
    <Postcard className={className}>
      <defs><HGrad id={`${id}p`} stops={[[0, "#c99a78"], [0.4, "#fbe3c7"], [0.62, "#f2cfa9"], [1, "#b98a6a"]]} /></defs>
      <rect x={40} y={186} width={220} height={14} fill="#c9a07c" />
      {prang(78, 0.5)}{prang(222, 0.5)}{prang(110, 0.62)}{prang(190, 0.62)}{prang(150, 1)}
    </Postcard>
  )
}

function Gyeongbokgung({ className }: { className: string }) {
  const id = useId()
  return (
    <Postcard className={className}>
      <defs>
        <VGrad id={`${id}r`} stops={[[0, "#5a6068"], [1, "#2f343b"]]} />
        <HGrad id={`${id}s`} stops={[[0, "#9c9a94"], [0.5, "#d6d3cb"], [1, "#a3a09a"]]} />
      </defs>
      <rect x={60} y={150} width={180} height={50} fill={`url(#${id}s)`} />
      {[106, 150, 194].map((x) => <path key={x} d={`M${x - 10} 200V172Q${x} 158 ${x + 10} 172V200Z`} fill="#3a3530" />)}
      {[82, 108, 134, 166, 192, 218].map((x) => <rect key={x} x={x} y={120} width={5} height={30} fill="#9b3a2c" />)}
      <rect x={76} y={112} width={148} height={9} fill="#3f8c80" />
      <rect x={76} y={116} width={148} height={2} fill="#d4a55a" opacity={0.8} />
      <path d="M44 114Q80 106 100 96L118 80H182L200 96Q220 106 256 114Q240 110 224 111H76Q60 110 44 114Z" fill={`url(#${id}r)`} />
      <path d="M118 80H182" stroke="#1f2328" strokeWidth={3} strokeLinecap="round" />
      <path d="M78 84Q104 76 116 68L128 56H172L184 68Q196 76 222 84Q210 82 198 82H102Q90 82 78 84Z" fill={`url(#${id}r)`} />
      <rect x={106} y={84} width={88} height={12} fill="#3f8c80" />
      {[112, 136, 160, 184].map((x) => <rect key={x} x={x} y={84} width={4} height={12} fill="#9b3a2c" />)}
    </Postcard>
  )
}

function Taipei101({ className }: { className: string }) {
  const id = useId()
  return (
    <Postcard className={className}>
      <defs><HGrad id={`${id}g`} stops={[[0, "#1d3f4a"], [0.45, "#3f7a86"], [0.6, "#5d9aa4"], [1, "#22464f"]]} /></defs>
      <path d="M128 200V156H172V200Z" fill={`url(#${id}g)`} />
      {Array.from({ length: 8 }, (_, i) => 150 - i * 12.5).map((yb) => (
        <g key={yb}>
          <path d={`M134 ${yb}L130 ${yb - 12.5}H170L166 ${yb}Z`} fill={`url(#${id}g)`} />
          <path d={`M130 ${yb - 12.5}H170`} stroke="#f6c86a" strokeWidth={1} opacity={0.9} />
          {[140, 150, 160].map((x) => <rect key={x} x={x - 1} y={yb - 9} width={2} height={1.4} fill="#ffe7a6" opacity={0.8} />)}
        </g>
      ))}
      <path d="M138 50L140 40H160L162 50Z" fill={`url(#${id}g)`} />
      <path d="M144 40L146 30H154L156 40Z" fill={`url(#${id}g)`} />
      <rect x={149.2} y={6} width={1.6} height={24} fill="#cfd8dc" />
      <circle cx={150} cy={6} r={1.6} fill="#ff8a7a" />
    </Postcard>
  )
}

/** Round watercolour tree canopies (blossom or autumn colour) for the edges of a scene. */
function Trees({ color, light, spots }: { color: string; light: string; spots: string[] }) {
  return <>{spots.map((s) => (
    <span key={s} aria-hidden className={cn("pointer-events-none absolute block rounded-full blur-[0.5px]", s)}
      style={{ backgroundImage: `radial-gradient(circle at 35% 30%, ${light}, ${color} 65%)` }} />
  ))}</>
}

/** A city skyline at night: dark towers with a few lit windows. */
function Skyline({ className }: { className: string }) {
  const towers: [number, number, number][] = [[20, 40, 70], [70, 30, 100], [110, 44, 60], [170, 26, 90], [210, 40, 120], [270, 30, 80], [320, 50, 64], [390, 28, 104], [440, 44, 76], [500, 30, 96], [550, 40, 58], [610, 26, 88], [660, 46, 110], [730, 30, 70], [780, 40, 96], [840, 28, 64], [890, 44, 100], [950, 30, 80], [1000, 40, 118], [1060, 30, 72], [1110, 44, 94], [1170, 30, 66]]
  return (
    <svg viewBox="0 0 1200 140" preserveAspectRatio="none" aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 w-full", className)}>
      {towers.map(([x, w, h]) => (
        <g key={x}>
          <rect x={x} y={140 - h} width={w} height={h} fill="#141c3a" />
          {Array.from({ length: Math.floor(h / 16) }, (_, i) => <rect key={i} x={x + 6 + ((i * 7) % (w - 12))} y={140 - h + 8 + i * 16} width={4} height={3} fill="#ffd98a" opacity={0.7} />)}
        </g>
      ))}
    </svg>
  )
}

/** Soft, out-of-focus points of light. */
function Bokeh({ spots }: { spots: string[] }) {
  return <>{spots.map((s) => <span key={s} aria-hidden className={cn("pointer-events-none absolute block rounded-full bg-[radial-gradient(circle,rgb(255_255_236/0.6),rgb(255_255_236/0)_70%)]", s)} />)}</>
}

/* Scenes */

// Where a landmark stands: behind Faldo on phones (like a photo of him in front of it), in the open stretch between
// the greeting and his note on desktop. `COMPACT` centres it in the small Streaks preview.
const LANDMARK = "left-[-4%] bottom-[16%] w-[52%] lg:left-[31%] lg:bottom-[8%] lg:w-[20%]"
const COMPACT = "left-1/2 bottom-[10%] h-[82%] -translate-x-1/2"

/**
 * Faldo's home: a pixel-art bamboo valley (misty jade mountains, a pale sun, a pagoda on a far cliff with a waterfall,
 * bamboo framing both sides and a mossy ledge he sits on). A soft jade shade over the top keeps the white greeting
 * readable and matches the status bar; the rest of the painting stays as it is.
 */
function BambooValley({ compact }: { compact?: boolean }) {
  return (
    <>
      <Image src="/brand/scenes/bamboo-valley.webp" alt="" fill priority={!compact} quality={90}
        sizes={compact ? "240px" : "(min-width: 1024px) 1240px, 100vw"}
        className={cn("object-cover", compact ? "object-center" : "object-[92%_100%] lg:object-[50%_30%]")} />
      {/* Shade where the white text sits: across the top on phones, behind the greeting at the lower left on desktop. */}
      {!compact && <span aria-hidden className="absolute inset-0 block bg-[linear-gradient(180deg,rgb(18_60_50/0.5),rgb(18_60_50/0.18)_45%,transparent_62%)] lg:bg-[radial-gradient(48%_95%_at_0%_78%,rgb(18_60_50/0.6),rgb(18_60_50/0.2)_60%,transparent_85%)]" />}
    </>
  )
}

function Landmark({ theme, compact, land, ground, water, extras, children }: {
  theme: string
  compact?: boolean
  land: { points: Pt[]; color: string }[]
  ground?: { top: string; bottom: string; rim?: string }
  water?: { top: string; bottom: string }
  extras?: React.ReactNode
  children: (className: string) => React.ReactNode
}) {
  return (
    <>
      {!compact && <Cloud theme={theme} className="top-[18%] right-[-4%] w-32 lg:top-[10%] lg:right-[28%] lg:w-36" />}
      <Washes className="h-[52%] lg:h-[74%]" layers={land.map((l) => ({ ...l, fade: 0.8 }))} />
      <Mist className="bottom-[20%] opacity-80 lg:bottom-[28%]" />
      {children(compact ? COMPACT : LANDMARK)}
      {water && <Water top={water.top} bottom={water.bottom} className="h-[16%] lg:h-[20%]" />}
      {ground && <Ground className="h-[16%] lg:h-[22%]" points={[[0, 170], [300, 130], [640, 168], [960, 134], [1200, 160]]} {...ground} />}
      {!compact && extras}
      <Grain />
    </>
  )
}

const SCENES: Record<string, (compact: boolean) => React.ReactNode> = {
  meadow: (compact) => <BambooValley compact={compact} />,
  sunrise: (compact) => (
    <Landmark theme="sunrise" compact={compact}
      land={[{ points: [[0, 210], [300, 190], [640, 206], [960, 186], [1200, 200]], color: "#8e9fb6" }]}
      ground={{ top: "#7cbf5a", bottom: "#4f8f3e", rim: "rgb(240 255 200 / 0.55)" }}
      extras={<><Palm className="bottom-0 -right-4 h-[46%] lg:right-[2%]" /><Palm flip className="bottom-0 right-[16%] h-[34%] max-lg:hidden" /></>}>
      {(c) => <Mayon className={c} />}
    </Landmark>
  ),
  terraces: (compact) => (
    <Landmark theme="terraces" compact={compact}
      land={[{ points: peaks([[150, 120], [420, 150], [700, 110], [980, 140]], 250), color: "#6f9d93" }, { points: peaks([[60, 90], [320, 120], [600, 80], [880, 110], [1140, 90]], 280), color: "#3f7a62" }]}
      ground={{ top: "#6fa84f", bottom: "#44803a", rim: "rgb(220 250 190 / 0.5)" }}>
      {(c) => <Banaue className={c} />}
    </Landmark>
  ),
  lagoon: (compact) => (
    <Landmark theme="lagoon" compact={compact}
      land={[{ points: [[0, 230], [400, 226], [800, 232], [1200, 228]], color: "#7fa0b8" }]}
      water={{ top: "#4f98c9", bottom: "#2a6fa6" }}>
      {(c) => <MarinaBay className={c} />}
    </Landmark>
  ),
  hills: (compact) => (
    <Landmark theme="hills" compact={compact}
      land={[{ points: [[0, 220], [300, 204], [640, 214], [960, 200], [1200, 212]], color: "#9fb2c6" }]}
      ground={{ top: "#8cbf6a", bottom: "#5a944a", rim: "rgb(240 255 220 / 0.55)" }}
      extras={<Trees color="#eea3b8" light="#fbd9e2" spots={["-right-6 bottom-[6%] size-20", "right-[12%] bottom-[2%] size-14 max-lg:hidden"]} />}>
      {(c) => <Fuji className={c} />}
    </Landmark>
  ),
  bay_sunset: (compact) => (
    <Landmark theme="bay_sunset" compact={compact}
      land={[{ points: [[0, 214], [300, 200], [640, 210], [960, 196], [1200, 208]], color: "#8a6a86" }]}
      water={{ top: "#e79a6a", bottom: "#8f5a74" }}>
      {(c) => <WatArun className={c} />}
    </Landmark>
  ),
  seoul: (compact) => (
    <Landmark theme="seoul" compact={compact}
      land={[{ points: peaks([[180, 150], [470, 110], [760, 160], [1040, 120]], 260), color: "#6f8a6a" }]}
      ground={{ top: "#c9b48a", bottom: "#a8926a", rim: "rgb(255 245 220 / 0.6)" }}
      extras={<Trees color="#d9642f" light="#f6a45a" spots={["-right-5 bottom-[4%] size-20", "right-[14%] bottom-0 size-14 max-lg:hidden"]} />}>
      {(c) => <Gyeongbokgung className={c} />}
    </Landmark>
  ),
  night_market: (compact) => (
    <Landmark theme="night_market" compact={compact}
      land={[{ points: peaks([[200, 110], [520, 140], [840, 100], [1100, 130]], 260), color: "#1f2c56" }]}
      extras={<Bokeh spots={["top-[14%] left-[40%] size-1", "top-[22%] left-[62%] size-1.5", "top-[8%] left-[78%] size-1", "top-[30%] right-[8%] size-1"]} />}>
      {(c) => (
        <>
          <Skyline className="h-[26%] lg:h-[34%]" />
          <Taipei101 className={c} />
        </>
      )}
    </Landmark>
  ),
}

/**
 * The scene behind a band (Home, Wallet) for the chosen environment: Faldo's bamboo valley, or a landmark across Asia.
 * `compact` is the small preview on the Streaks page.
 */
export function BandScenery({ theme, compact, className }: { theme?: string | null; compact?: boolean; className?: string }) {
  const id = theme && theme in SCENES ? theme : "meadow"
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      {SCENES[id](!!compact)}
    </div>
  )
}

/** Watercolour bamboo for smaller surfaces (sign-in), anchored to the bottom right of its box. */
export function BambooDecor({ className, tone = "onGreen" }: { className?: string; tone?: "onGreen" | "onLight" }) {
  return (
    <div aria-hidden className={cn("pointer-events-none", tone === "onLight" && "opacity-60", className)}>
      <Bamboo culms={[
        { x: 110, w: 11, every: 104, offset: 30, sprays: [{ node: 1, side: "left" }, { node: 3, side: "left", size: 1.1, tone: 1 }] },
        { x: 156, w: 13, every: 118, offset: 70, sprays: [{ node: 2, side: "left", size: 1.15 }] },
        { x: 196, w: 10, every: 110, offset: 10, sprays: [{ node: 3, side: "left", size: 0.95, tone: 2 }] },
      ]} className="right-0 bottom-0 h-full" />
    </div>
  )
}
