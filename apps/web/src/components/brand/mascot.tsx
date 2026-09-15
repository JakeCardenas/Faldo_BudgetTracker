import { useId } from "react"
import { cn } from "@/lib/utils"

export type MascotMood = "happy" | "worried"

export function Mascot({ mood = "happy", className }: { mood?: MascotMood; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn("h-auto w-24", className)}>
      <ellipse cx="60" cy="110" rx="30" ry="5" fill="#000" opacity="0.14" />
      <path d="M60 44c0-9 .6-15 2-22" stroke="#4d8a4e" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M61 33c-12 1-21-6-23-17 12-2 22 5 23 17Z" fill="#8cc084" />
      <path d="M62 28c9-1 18-8 19-19-11-1-19 6-19 19Z" fill="#5d9e59" />
      <ellipse cx="27" cy="80" rx="6.5" ry="9" transform="rotate(-24 27 80)" fill="#b7d9a6" />
      <ellipse cx="48" cy="104" rx="10" ry="5" fill="#9cc98c" />
      <ellipse cx="72" cy="104" rx="10" ry="5" fill="#9cc98c" />
      <ellipse cx="60" cy="72" rx="35" ry="33" fill="#cfe6c1" />
      <ellipse cx="60" cy="82" rx="23" ry="18" fill="#e6f2de" />
      <ellipse cx="48" cy="66" rx="4.6" ry="5.6" fill="#1c261d" />
      <ellipse cx="72" cy="66" rx="4.6" ry="5.6" fill="#1c261d" />
      <circle cx="49.6" cy="64" r="1.7" fill="#fff" />
      <circle cx="73.6" cy="64" r="1.7" fill="#fff" />
      <ellipse cx="40" cy="76" rx="5.2" ry="3" fill="#f3a39a" opacity="0.65" />
      <ellipse cx="80" cy="76" rx="5.2" ry="3" fill="#f3a39a" opacity="0.65" />
      {mood === "happy" ? (
        <path d="M54.5 75.5q5.5 5.5 11 0" stroke="#1c261d" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      ) : (
        <>
          <path d="M55 78.5q5-3.5 10 0" stroke="#1c261d" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M42.5 57.5l9-2.5M77.5 57.5l-9-2.5" stroke="#1c261d" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      <circle cx="94" cy="86" r="12" fill="#f2c14e" stroke="#d69c2c" strokeWidth="2.4" />
      <text x="94" y="90.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#9c6710" fontFamily="system-ui, sans-serif">₱</text>
      <ellipse cx="86" cy="84" rx="6.5" ry="5.5" fill="#b7d9a6" />
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
