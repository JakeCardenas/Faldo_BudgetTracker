"use client"

import { useEffect, useRef } from "react"
import { useSonner } from "sonner"
import { onFirstGesture, play, unlockSounds } from "@/lib/sound"

export function SoundEffects() {
  const { toasts } = useSonner()
  const seen = useRef(new Set<string | number>())

  useEffect(() => onFirstGesture(unlockSounds), [])

  useEffect(() => {
    for (const t of toasts) {
      if (seen.current.has(t.id)) continue
      seen.current.add(t.id)
      if (t.type === "error") play("error")
      else if (t.type === "success") play("success")
    }
  }, [toasts])

  return null
}
