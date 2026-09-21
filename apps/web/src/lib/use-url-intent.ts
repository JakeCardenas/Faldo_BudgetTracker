"use client"

import { useEffect, useState } from "react"

/**
 * Reads a one-off intent from the URL (for example `?new=1` from the + menu), then removes it so a
 * refresh or back navigation doesn't repeat the action.
 */
export function useUrlIntent(key: string) {
  const [value, setValue] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const found = params.get(key)
    if (found === null) return
    params.delete(key)
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`)
    const timer = setTimeout(() => setValue(found), 0)
    return () => clearTimeout(timer)
  }, [key])
  return value
}
