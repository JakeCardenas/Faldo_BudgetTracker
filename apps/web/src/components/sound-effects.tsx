"use client"

import { useEffect, useRef } from "react"
import { useSonner } from "sonner"
import { play, unlockSounds } from "@/lib/sound"

export function SoundEffects() {
  const { toasts } = useSonner()
  const seen = useRef(new Set<string | number>())

  useEffect(() => {
    const unlock = () => unlockSounds()
    window.addEventListener("pointerdown", unlock, { capture: true, passive: true })
    window.addEventListener("keydown", unlock, { capture: true })
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true })
      window.removeEventListener("keydown", unlock, { capture: true })
    }
  }, [])

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
