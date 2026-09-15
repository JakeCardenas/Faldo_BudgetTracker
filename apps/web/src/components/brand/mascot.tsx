import { useId } from "react"
import { cn } from "@/lib/utils"

export type MascotMood = "happy" | "worried" | "proud" | "sleepy"

function Sprout() {
  return (
    <>
      <path d="M60 44c0-9 .6-15 2-22" stroke="#4d8a4e" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M61 33c-12 1-21-6-23-17 12-2 22 5 23 17Z" fill="#8cc084" />
      <path d="M62 28c9-1 18-8 19-19-11-1-19 6-19 19Z" fill="#5d9e59" />
    </>
  )
}

function Face({ mood }: { mood: MascotMood }) {
  if (mood === "sleepy") {
    return (
      <>
        <path d="M43 67q5 3.5 10 0M67 67q5 3.5 10 0" stroke="#1c261d" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <ellipse cx="60" cy="77" rx="3" ry="2.2" fill="#1c261d" opacity="0.75" />
      </>
    )
  }
  return (
    <>
      <ellipse cx="48" cy="66" rx="4.6" ry="5.6" fill="#1c261d" />
      <ellipse cx="72" cy="66" rx="4.6" ry="5.6" fill="#1c261d" />
      <circle cx="49.6" cy="64" r="1.7" fill="#fff" />
      <circle cx="73.6" cy="64" r="1.7" fill="#fff" />
      {mood === "worried" ? (
        <>
          <path d="M55 78.5q5-3.5 10 0" stroke="#1c261d" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M42.5 57.5l9-2.5M77.5 57.5l-9-2.5" stroke="#1c261d" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : mood === "proud" ? (
        <path d="M53 74.5q7 8 14 0Z" fill="#1c261d" stroke="#1c261d" strokeWidth="1.6" strokeLinejoin="round" />
      ) : (
        <path d="M54.5 75.5q5.5 5.5 11 0" stroke="#1c261d" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      )}
    </>
  )
}

function Outfit({ id, layer }: { id: string; layer: "back" | "front" }) {
  if (layer === "back") return null
  switch (id) {
    case "bucket_hat":
      return (
        <g>
          <path d="M36 46c1-14 11-22 24-22s23 8 24 22Z" fill="#f2c75c" />
          <path d="M37 41h46v5H37Z" fill="#d9534f" />
          <ellipse cx="60" cy="47" rx="37" ry="6" fill="#e9b949" />
        </g>
      )
    case "scarf":
      return (
        <g>
          <path d="M29 86q31 17 62 0l3 9q-34 19-68 0Z" fill="#d9534f" />
          <path d="M71 96l9 17-9 3-7-17Z" fill="#c2413c" />
          <path d="M34 90l3 5M44 94l2 5M56 96l1 5M68 95l-1 5M80 91l-2 5" stroke="#f3a39a" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )
    case "headphones":
      return (
        <g>
          <path d="M25 70c0-26 15-38 35-38s35 12 35 38" stroke="#2f3b33" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="17" y="60" width="13" height="22" rx="6" fill="#4a7f52" />
          <rect x="90" y="60" width="13" height="22" rx="6" fill="#4a7f52" />
        </g>
      )
    case "flower_crown":
      return (
        <g>
          <path d="M31 50q29-16 58 0" stroke="#5d9e59" strokeWidth="3" fill="none" strokeLinecap="round" />
          {[[34, 47, "#f7a8c4"], [46, 41, "#fff4b8"], [60, 39, "#f28fb0"], [74, 41, "#fff4b8"], [86, 47, "#f7a8c4"]].map(([x, y, c]) => (
            <g key={`${x}`}>
              <circle cx={x as number} cy={y as number} r="5" fill={c as string} />
              <circle cx={x as number} cy={y as number} r="1.8" fill="#f2c14e" />
            </g>
          ))}
        </g>
      )
    case "grad_cap":
      return (
        <g>
          <path d="M42 42v9q18 8 36 0v-9Z" fill="#2c3a32" />
          <path d="M60 24l37 12-37 12-37-12Z" fill="#1f2a24" />
          <path d="M60 36l28 5v14" stroke="#f2c14e" strokeWidth="1.8" fill="none" />
          <circle cx="88" cy="57" r="3" fill="#f2c14e" />
        </g>
      )
    case "shades":
      return (
        <g>
          <rect x="37" y="59" width="21" height="13" rx="5.5" fill="#1c261d" />
          <rect x="62" y="59" width="21" height="13" rx="5.5" fill="#1c261d" />
          <path d="M58 64h4" stroke="#1c261d" strokeWidth="2.4" />
          <path d="M41 62l6 0M66 62l6 0" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        </g>
      )
    case "crown":
      return (
        <g>
          <path d="M40 46l3-19 9 10 8-14 8 14 9-10 3 19Z" fill="#f2c14e" stroke="#d69c2c" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="60" cy="38" r="2.6" fill="#d9534f" />
          <circle cx="48" cy="41" r="1.8" fill="#6d8fc0" />
          <circle cx="72" cy="41" r="1.8" fill="#6d8fc0" />
        </g>
      )
    default:
      return null
  }
}

const HEADWEAR = new Set(["bucket_hat", "grad_cap", "crown"])

export function Mascot({ mood = "happy", outfit = "classic", coin = true, className }: {
  mood?: MascotMood
  outfit?: string
  coin?: boolean
  className?: string
}) {
  const hidesSprout = HEADWEAR.has(outfit)
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn("h-auto w-24", className)}>
      <ellipse cx="60" cy="110" rx="30" ry="5" fill="#000" opacity="0.14" />
      {!hidesSprout && <Sprout />}
      <ellipse cx="27" cy="80" rx="6.5" ry="9" transform="rotate(-24 27 80)" fill="#b7d9a6" />
      <ellipse cx="48" cy="104" rx="10" ry="5" fill="#9cc98c" />
      <ellipse cx="72" cy="104" rx="10" ry="5" fill="#9cc98c" />
      <ellipse cx="60" cy="72" rx="35" ry="33" fill="#cfe6c1" />
      <ellipse cx="60" cy="82" rx="23" ry="18" fill="#e6f2de" />
      <ellipse cx="40" cy="76" rx="5.2" ry="3" fill="#f3a39a" opacity="0.65" />
      <ellipse cx="80" cy="76" rx="5.2" ry="3" fill="#f3a39a" opacity="0.65" />
      <Face mood={mood} />
      <Outfit id={outfit} layer="front" />
      {coin && (
        <>
          <circle cx="94" cy="86" r="12" fill="#f2c14e" stroke="#d69c2c" strokeWidth="2.4" />
          <text x="94" y="90.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#9c6710" fontFamily="system-ui, sans-serif">₱</text>
          <ellipse cx="86" cy="84" rx="6.5" ry="5.5" fill="#b7d9a6" />
        </>
      )}
    </svg>
  )
}

export function LeafPattern({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg aria-hidden className={className}>
      <defs>
        <pattern id={id} width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
          <path d="M20 40c0-16 12-28 30-30-2 18-14 30-30 30Z" fill="currentColor" />
          <path d="M20 40 42 18" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
          <path d="M80 100c4-14 16-22 32-20-4 15-17 23-32 20Z" fill="currentColor" />
          <circle cx="92" cy="30" r="3" fill="currentColor" />
          <circle cx="36" cy="92" r="2" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}
