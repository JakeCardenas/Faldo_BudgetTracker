import { useId } from "react"
import { LeafPattern } from "@/components/brand/mascot"
import { cn } from "@/lib/utils"

function Sky({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${id})`} />
    </>
  )
}

export function Scene({ id, className }: { id: string; className?: string }) {
  const gid = useId().replace(/:/g, "")
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" aria-hidden className={cn("size-full", className)}>{children}</svg>
  )

  switch (id) {
    case "sunrise":
      return svg(
        <>
          <Sky id={gid} from="#ffcf9e" to="#ff9d80" />
          <circle cx="250" cy="120" r="34" fill="#fff1c9" opacity="0.9" />
          <path d="M120 150 205 70q10-8 20 0l85 80Z" fill="#8a6f9c" />
          <path d="M196 78q14-10 28 0l-6 10q-8-5-16 0Z" fill="#6d5680" />
          <path d="M0 140q100-20 200 0t200 0v60H0Z" fill="#6f8fbd" />
          <path d="M0 160q100-12 200 0t200 0v40H0Z" fill="#5a79a8" />
        </>,
      )
    case "terraces":
      return svg(
        <>
          <Sky id={gid} from="#d3ecf7" to="#eef7ea" />
          <path d="M0 110 90 50l70 40 80-60 160 90v80H0Z" fill="#9cc0a6" />
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M-10 ${120 + i * 18}q110 -${26 - i * 3} 210 0t210 0v${40}H-10Z`} fill={["#8fbf6a", "#7db25a", "#6ea64d", "#5f9842", "#4f8a38"][i]} />
          ))}
        </>,
      )
    case "lagoon":
      return svg(
        <>
          <Sky id={gid} from="#bfe6f1" to="#e9f7f4" />
          <path d="M0 150V80q20-40 45-10t30-30q25 5 30 45t20 65Z" fill="#6f8f7a" />
          <path d="M290 150q5-70 30-80t25-30q30 10 35 50t20 60Z" fill="#5e8069" />
          <path d="M60 60q10-18 25-6M330 52q12-15 26-4" stroke="#4f7a58" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M0 140h400v60H0Z" fill="#46c2c0" />
          <path d="M0 150q100 10 200 0t200 0v50H0Z" fill="#2fa7b0" />
          <path d="M40 165h40M180 172h60M300 160h50" stroke="#bff0ee" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </>,
      )
    case "hills":
      return svg(
        <>
          <Sky id={gid} from="#e7f2d6" to="#f6f1dd" />
          {[[40, 150, 60], [130, 140, 70], [230, 150, 64], [320, 142, 72], [85, 175, 70], [190, 180, 76], [300, 178, 70], [390, 170, 60]].map(([x, y, r], i) => (
            <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.72} fill={i % 3 === 0 ? "#a0794f" : i % 3 === 1 ? "#8a643e" : "#98a857"} />
          ))}
          <path d="M0 185h400v15H0Z" fill="#7a9a4a" />
        </>,
      )
    case "bay_sunset":
      return svg(
        <>
          <Sky id={gid} from="#ff9a6b" to="#ffd199" />
          <circle cx="200" cy="140" r="48" fill="#ffe7a8" />
          <path d="M0 140h400v60H0Z" fill="#3b5a86" />
          <path d="M0 150q100 8 200 0t200 0v50H0Z" fill="#2f4a73" />
          <path d="M160 152h80M175 164h50M190 176h20" stroke="#ffd199" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
          <path d="M60 138h30l-5 8H66Z M320 134h26l-4 7h-18Z" fill="#1f2f48" />
          <path d="M75 138v-18l10 14M333 134v-15l8 12" stroke="#1f2f48" strokeWidth="2" fill="none" />
        </>,
      )
    case "night_market":
      return svg(
        <>
          <Sky id={gid} from="#1d2b4f" to="#3b3a6b" />
          {Array.from({ length: 14 }).map((_, i) => (
            <circle key={i} cx={20 + i * 28} cy={40 + Math.sin(i) * 10} r="3.4" fill={["#ffd36b", "#ff8f8f", "#8fe3b0", "#ffb86b"][i % 4]} />
          ))}
          <path d="M0 40q100 22 200 0t200 0" stroke="#10182e" strokeWidth="1.5" fill="none" />
          {[[10, 90], [110, 100], [210, 88], [310, 96]].map(([x, h], i) => (
            <g key={i}>
              <path d={`M${x} ${200 - h}h80l-8 16H${x + 8}Z`} fill={["#d9534f", "#e0a458", "#4a7f52", "#6d8fc0"][i]} />
              <rect x={x + 8} y={216 - h} width="64" height={h} fill="#141c33" />
            </g>
          ))}
        </>,
      )
    case "meadow":
    default:
      return (
        <div className={cn("relative size-full bg-gradient-to-br from-hero to-hero-deep", className)}>
          <LeafPattern className="absolute inset-0 size-full text-white/[0.06]" />
        </div>
      )
  }
}
