"use client"

import { useEffect, useState } from "react"
import { Splash } from "@/components/brand/splash"

export const WELCOME_KEY = "faldo:welcome"

export function markWelcome() {
  try {
    window.sessionStorage.setItem(WELCOME_KEY, "1")
  } catch {}
}

function hasWelcome() {
  try {
    return window.sessionStorage.getItem(WELCOME_KEY) === "1"
  } catch {
    return false
  }
}

export default function WelcomeSplash() {
  const [show] = useState(hasWelcome)
  useEffect(() => {
    if (!show) return
    try {
      window.sessionStorage.removeItem(WELCOME_KEY)
    } catch {}
  }, [show])
  return show ? <Splash force /> : null
}
