export type SoundName =
  | "tap" | "type" | "select" | "button" | "open" | "close" | "undo" | "send"
  | "success" | "error" | "disabled" | "toggleOn" | "toggleOff" | "celebrate"

const FILES: Record<SoundName, string[]> = {
  tap: ["tap"],
  type: ["type-1", "type-2", "type-3", "type-4", "type-5"],
  select: ["select"],
  button: ["button"],
  open: ["open"],
  close: ["close"],
  undo: ["undo"],
  send: ["send"],
  success: ["success"],
  error: ["error"],
  disabled: ["disabled"],
  toggleOn: ["toggle-on"],
  toggleOff: ["toggle-off"],
  celebrate: ["celebrate"],
}

const VOLUME: Partial<Record<SoundName, number>> = { type: 0.35, tap: 0.4, celebrate: 0.5, success: 0.55 }
const STORAGE_KEY = "faldo:sounds"

let context: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
let loading: Promise<void> | null = null
const listeners = new Set<(enabled: boolean) => void>()

export function soundsEnabled() {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

export function setSoundsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off")
  } catch {}
  listeners.forEach((listener) => listener(enabled))
}

export function onSoundsChange(listener: (enabled: boolean) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getContext() {
  if (typeof window === "undefined") return null
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
  }
  return context
}

function preload() {
  const ctx = getContext()
  if (!ctx || loading) return loading
  const names = [...new Set(Object.values(FILES).flat())]
  loading = Promise.all(names.map(async (name) => {
    try {
      const response = await fetch(`/sounds/${name}.wav`)
      buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()))
    } catch {}
  })).then(() => undefined)
  return loading
}

export function unlockSounds() {
  const ctx = getContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()
  void preload()
}

export function play(name: SoundName) {
  if (!soundsEnabled() || typeof document === "undefined" || document.hidden) return
  const ctx = getContext()
  if (!ctx) return
  const files = FILES[name]
  const file = files[Math.floor(Math.random() * files.length)]
  const start = () => {
    const buffer = buffers.get(file)
    if (!buffer || ctx.state !== "running") return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = VOLUME[name] ?? 0.6
    source.buffer = buffer
    source.connect(gain).connect(ctx.destination)
    source.start()
  }
  if (buffers.has(file)) start()
  else void preload()?.then(start)
}
