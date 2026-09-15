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

type Cue = { at: number; sound: SoundName; volume?: number } | { at: number; note: number; volume?: number; length?: number }

const SPLASH_CUES: Cue[] = [
  { at: 90, sound: "open", volume: 0.5 },
  { at: 1060, sound: "send", volume: 0.32 },
  { at: 1380, note: 659.25, volume: 0.1 },
  { at: 1470, note: 830.61, volume: 0.1 },
  { at: 1560, note: 987.77, volume: 0.1 },
  { at: 1670, note: 1318.51, volume: 0.12, length: 0.9 },
]
const SPLASH_END = 2350

let context: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
let loading: Promise<void> | null = null

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

export function preloadSounds() {
  const ctx = getContext()
  if (!ctx) return Promise.resolve()
  if (loading) return loading
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
  void preloadSounds()
}

function canPlay(ctx: AudioContext | null): ctx is AudioContext {
  return Boolean(ctx) && soundsEnabled() && typeof document !== "undefined" && !document.hidden && ctx!.state === "running"
}

function startBuffer(ctx: AudioContext, name: SoundName, when: number, volume?: number) {
  const files = FILES[name]
  const buffer = buffers.get(files[Math.floor(Math.random() * files.length)])
  if (!buffer) return
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  gain.gain.value = volume ?? VOLUME[name] ?? 0.6
  source.buffer = buffer
  source.connect(gain).connect(ctx.destination)
  source.start(when)
}

function startNote(ctx: AudioContext, frequency: number, when: number, volume = 0.1, length = 0.45) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  osc.frequency.setValueAtTime(frequency, when)
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(when)
  osc.stop(when + length + 0.05)
}

export function play(name: SoundName) {
  const ctx = getContext()
  if (!canPlay(ctx)) return
  const files = FILES[name]
  if (files.every((f) => buffers.has(f))) startBuffer(ctx, name, ctx.currentTime)
  else void preloadSounds().then(() => { if (canPlay(ctx)) startBuffer(ctx, name, ctx.currentTime) })
}

export function playSplash(getElapsed: () => number) {
  const ctx = getContext()
  if (!ctx || !soundsEnabled()) return () => undefined
  let cancelled = false
  let scheduled = false

  const schedule = () => {
    if (cancelled || scheduled || !canPlay(ctx)) return
    const elapsed = getElapsed()
    if (elapsed >= SPLASH_END - 250) return
    scheduled = true
    const now = ctx.currentTime
    for (const cue of SPLASH_CUES) {
      const delay = (cue.at - elapsed) / 1000
      if (delay < -(cue.at < 600 ? 0.5 : 0.12)) continue
      const when = now + Math.max(0, delay)
      if ("sound" in cue) startBuffer(ctx, cue.sound, when, cue.volume)
      else startNote(ctx, cue.note, when, cue.volume, cue.length)
    }
  }

  void preloadSounds().then(() => {
    if (ctx.state === "running") schedule()
    else void ctx.resume().then(schedule).catch(() => undefined)
  })
  const onGesture = () => { void ctx.resume().then(() => preloadSounds()).then(schedule).catch(() => undefined) }
  window.addEventListener("pointerdown", onGesture, { capture: true, passive: true })
  window.addEventListener("keydown", onGesture, { capture: true })

  return () => {
    cancelled = true
    window.removeEventListener("pointerdown", onGesture, { capture: true })
    window.removeEventListener("keydown", onGesture, { capture: true })
  }
}
