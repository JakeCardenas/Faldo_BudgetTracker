"use client"

import { useState } from "react"
import { Splash } from "@/components/brand/splash"

export const WELCOME_KEY = "faldo:welcome"

export function markWelcome() {
  try {
    window.sessionStorage.setItem(WELCOME_KEY, "1")
  } catch {}
}

function consumeWelcome() {
  try {
    const pending = window.sessionStorage.getItem(WELCOME_KEY) === "1"
    window.sessionStorage.removeItem(WELCOME_KEY)
    return pending
  } catch {
    return false
  }
}

export default function WelcomeSplash() {
  const [show] = useState(consumeWelcome)
  return show ? <Splash force /> : null
}
