import { useId } from "react"
import { cn } from "@/lib/utils"

export type MascotMood = "happy" | "worried" | "proud" | "sleepy"

const INK = "#24472b"
const FUR_EDGE = "#a8cba1"

function Eyes({ mood }: { mood: MascotMood }) {
  if (mood === "sleepy") {
    return (
      <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M40 67q6.5 4.5 13 0" />
        <path d="M67 67q6.5 4.5 13 0" />
      </g>
    )
  }
  if (mood === "proud") {
    return (
      <g stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none">
        <path d="M40 68q6.5-7 13 0" />
        <path d="M67 68q6.5-7 13 0" />
      </g>
    )
  }
  return (
    <g>
      {[46.5, 73.5].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={66} rx="7.6" ry="8.4" fill={INK} />
          <path d={`M${cx - 5.6} ${67.5}a5.6 5.9 0 0 0 11 1.4a5 5 0 0 1-11-1.4Z`} fill="#ffffff" opacity="0.9" />
          <circle cx={cx + 2.4} cy={62.6} r="2.5" fill="#ffffff" />
        </g>
      ))}
      {mood === "worried" && (
        <g stroke={INK} strokeWidth="2" strokeLinecap="round">
          <path d="M39.5 55.5l9-2.4" />
          <path d="M80.5 55.5l-9-2.4" />
        </g>
      )}
    </g>
  )
}

function Mouth({ mood }: { mood: MascotMood }) {
  if (mood === "worried") return <path d="M56 85q4-2.8 8 0" stroke={INK} strokeWidth="1.9" strokeLinecap="round" fill="none" />
  if (mood === "proud") return <path d="M55.5 81.5q4.5 6.5 9 0Z" fill={INK} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
  if (mood === "sleepy") return <ellipse cx="60" cy="83.5" rx="1.9" ry="1.6" fill={INK} opacity="0.8" />
  return <path d="M55.2 81.4q2.4 2.9 4.8 0q2.4 2.9 4.8 0" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
}

function Outfit({ id }: { id: string }) {
  switch (id) {
    case "bucket_hat":
      return (
        <g>
          <path d="M37 45c1-13 10.5-21 23-21s22 8 23 21Z" fill="#f4f1e4" stroke="#ffffff" strokeWidth="1.2" />
          <path d="M38 40h44v5H38Z" fill="#4a7f52" />
          <ellipse cx="60" cy="46" rx="33" ry="5.5" fill="#e7e2cf" />
        </g>
      )
    case "scarf":
      return (
        <g>
          <path d="M29 86q31 17 62 0l3 9q-34 19-68 0Z" fill="#3f7046" />
          <path d="M71 96l9 17-9 3-7-17Z" fill="#335d3a" />
          <path d="M34 90l3 5M44 94l2 5M56 96l1 5M68 95l-1 5M80 91l-2 5" stroke="#b7d9b0" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )
    case "headphones":
      return (
        <g>
          <path d="M24 70c0-26 16-39 36-39s36 13 36 39" stroke="#2f3b33" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="16" y="60" width="13" height="22" rx="6" fill="#4a7f52" />
          <rect x="91" y="60" width="13" height="22" rx="6" fill="#4a7f52" />
        </g>
      )
    case "flower_crown":
      return (
        <g>
          <path d="M33 47q27-15 54 0" stroke="#4a7f52" strokeWidth="3" fill="none" strokeLinecap="round" />
          {[[35, 45, "#f7c9d4"], [46, 39.5, "#ffffff"], [60, 37.5, "#f3aec0"], [74, 39.5, "#ffffff"], [85, 45, "#f7c9d4"]].map(([x, y, c]) => (
            <g key={`${x}`}>
              <circle cx={x as number} cy={y as number} r="4.8" fill={c as string} />
              <circle cx={x as number} cy={y as number} r="1.7" fill="#f2c14e" />
            </g>
          ))}
        </g>
      )
    case "grad_cap":
      return (
        <g>
          <path d="M43 40v8q17 7.5 34 0v-8Z" fill="#2c3a32" />
          <path d="M60 23l36 11.5-36 11.5-36-11.5Z" fill="#1f2a24" />
          <path d="M60 34.5l27 5v13" stroke="#f2c14e" strokeWidth="1.8" fill="none" />
          <circle cx="87" cy="54.5" r="3" fill="#f2c14e" />
        </g>
      )
    case "shades":
      return (
        <g>
          <rect x="36.5" y="58" width="21" height="15" rx="6" fill="#1c261d" />
          <rect x="62.5" y="58" width="21" height="15" rx="6" fill="#1c261d" />
          <path d="M57.5 63.5h5" stroke="#1c261d" strokeWidth="2.4" />
          <path d="M40.5 61.5h6M66.5 61.5h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        </g>
      )
    case "crown":
      return (
        <g>
          <path d="M41 45l3-18 8.5 9.5 7.5-13 7.5 13 8.5-9.5 3 18Z" fill="#f2c14e" stroke="#d69c2c" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="60" cy="37" r="2.5" fill="#4a7f52" />
          <circle cx="49" cy="40" r="1.7" fill="#ffffff" />
          <circle cx="71" cy="40" r="1.7" fill="#ffffff" />
        </g>
      )
    default:
      return null
  }
}

export function Mascot({ mood = "happy", outfit = "classic", coin = true, className }: {
  mood?: MascotMood
  outfit?: string
  coin?: boolean
  className?: string
}) {
  const uid = useId().replace(/:/g, "")
  const fur = `fur-${uid}`
  const belly = `belly-${uid}`
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn("h-auto w-24", className)}>
      <defs>
        <linearGradient id={fur} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef7eb" />
          <stop offset="0.6" stopColor="#d7e9d2" />
          <stop offset="1" stopColor="#bdd8b7" />
        </linearGradient>
        <linearGradient id={belly} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eef6ec" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="111" rx="31" ry="4.5" fill="#000" opacity="0.13" />

      <g stroke={FUR_EDGE} strokeWidth="1.7" strokeLinejoin="round">
        <circle cx="33.5" cy="43" r="13.5" fill={`url(#${fur})`} />
        <circle cx="86.5" cy="43" r="13.5" fill={`url(#${fur})`} />
        <path d="M50 42c1.5-7 7-11.5 13.5-11.5-2 2.5-3 4.5-3.2 6.8 3-2 6.6-2.4 9-1.4-2.2 1.2-3.6 3-4.3 5.1Z" fill={`url(#${fur})`} />
        <path d="M22 76c-1-22 16-38 38-38s38 16 38 36c0 3 3 6 4 8-3 0-4-1-5-1-3 17-18 29-37 29S26 102 23 86c-2 1-5 1-7 0 2-2 5-5 6-10Z" fill={`url(#${fur})`} />
      </g>
      <circle cx="34" cy="44" r="7.6" fill="#a9cfa2" />
      <circle cx="86" cy="44" r="7.6" fill="#a9cfa2" />
      <path d="M24.5 41a10 10 0 0 1 8.5-8M78.5 36.5a10 10 0 0 1 9-2.5" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.85" />
      <path d="M38.5 53c4.5-7.5 11.5-12.5 21.5-13.5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.8" />
      <ellipse cx="60" cy="87" rx="26" ry="19.5" fill={`url(#${belly})`} />
      <g stroke={FUR_EDGE} strokeWidth="1.4">
        <ellipse cx="47" cy="108" rx="9" ry="4.6" fill="#c3dcbc" />
        <ellipse cx="73" cy="108" rx="9" ry="4.6" fill="#c3dcbc" />
      </g>
      <ellipse cx="50" cy="47" rx="11" ry="3.2" transform="rotate(-14 50 47)" fill="#ffffff" opacity="0.65" />

      <Eyes mood={mood} />
      <ellipse cx="37.5" cy="78.5" rx="5.2" ry="3" fill="#f3a39a" opacity="0.5" />
      <ellipse cx="82.5" cy="78.5" rx="5.2" ry="3" fill="#f3a39a" opacity="0.5" />
      <ellipse cx="60" cy="77" rx="4.2" ry="3" fill={INK} />
      <ellipse cx="59" cy="75.9" rx="1.5" ry="0.7" fill="#ffffff" opacity="0.75" />
      <Mouth mood={mood} />

      <g stroke={FUR_EDGE} strokeWidth="1.4">
        <ellipse cx="51" cy="96.5" rx="5.2" ry="4.2" fill="#d4e8ce" />
        {!coin && <ellipse cx="69" cy="96.5" rx="5.2" ry="4.2" fill="#d4e8ce" />}
      </g>

      <Outfit id={outfit} />

      {coin && (
        <>
          <circle cx="96" cy="89" r="12" fill="#f2c14e" stroke="#d69c2c" strokeWidth="2.4" />
          <text x="96.5" y="93.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#9c6710" fontFamily="system-ui, sans-serif">₱</text>
          <ellipse cx="84" cy="89" rx="6" ry="5.2" fill="#d4e8ce" stroke={FUR_EDGE} strokeWidth="1.4" />
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
