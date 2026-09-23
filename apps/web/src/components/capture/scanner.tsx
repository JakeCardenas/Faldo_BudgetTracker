"use client"

import { useEffect, useRef, useState } from "react"
import { Flashlight, FlashlightOff, Images, Loader2, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

/** What the scanner hands back: a picture of a receipt (the shutter or Photos), or the text of a QR code. */
export type ScanResult = { kind: "photo"; file: File } | { kind: "code"; text: string }

type Status = "starting" | "live" | "denied" | "unavailable"
type Box = { left: number; top: number; width: number; height: number }
type Point = { x: number; y: number }
type Reader = (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => Promise<{ text: string; points: Point[] } | null>

const SCAN_EVERY = 160 // ms between looks for a QR code
const LOOK_SIZE = 720 // the longest side of the frame the QR reader looks at

// Chrome on Android reads QR codes natively; Safari doesn't, so jsQR (loaded only now) reads them there.
interface NativeDetector { detect(source: CanvasImageSource): Promise<{ rawValue: string; cornerPoints: Point[] }[]> }
type NativeDetectorClass = { new(options: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> }

async function makeReader(): Promise<Reader> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (Native && (await Native.getSupportedFormats?.().catch((): string[] => []))?.includes("qr_code")) {
    const detector = new Native({ formats: ["qr_code"] })
    return async (canvas) => {
      const [hit] = await detector.detect(canvas)
      return hit ? { text: hit.rawValue, points: hit.cornerPoints } : null
    }
  }
  const { default: jsQR } = await import("jsqr")
  return async (canvas, context) => {
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const hit = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })
    if (!hit) return null
    const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = hit.location
    return { text: hit.data, points: [topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner] }
  }
}

/**
 * The scanner, like the iPhone's: the live camera full screen with rounded corner brackets. A QR code is picked up
 * by itself (the brackets close in on it and turn green); a receipt is taken with the shutter; Photos takes a
 * screenshot or picture instead. The camera runs only while this is open and the app is in front.
 */
export function Scanner({ open, onOpenChange, onResult }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResult: (result: ScanResult) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}
        className="inset-0 top-0 left-0 block h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none bg-black p-0 text-white shadow-none ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100">
        <DialogTitle className="sr-only">Scan</DialogTitle>
        <DialogDescription className="sr-only">Point the camera at a receipt and take it, or at a QR code.</DialogDescription>
        {open && <Viewfinder onClose={() => onOpenChange(false)} onResult={onResult} />}
      </DialogContent>
    </Dialog>
  )
}

function Viewfinder({ onClose, onResult }: { onClose: () => void; onResult: (result: ScanResult) => void }) {
  const report = useRef(onResult)
  useEffect(() => { report.current = onResult })
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const photos = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const [status, setStatus] = useState<Status>(() => (cameraSupported() ? "starting" : "unavailable"))
  const [torch, setTorch] = useState<boolean | null>(null) // null: no light this page can switch
  const [found, setFound] = useState<Box | null>(null)
  const [flash, setFlash] = useState(false)

  // The camera: the back one, as sharp as it offers. Leaving the app turns it off; coming back turns it on again.
  useEffect(() => {
    if (!cameraSupported()) return
    let cancelled = false
    const stop = () => {
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
    }
    const start = async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        })
        if (cancelled || document.hidden) return media.getTracks().forEach((track) => track.stop())
        stream.current = media
        const element = video.current
        if (element) {
          element.srcObject = media
          await element.play().catch(() => undefined)
        }
        const capabilities = media.getVideoTracks()[0]?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
        setTorch(capabilities?.torch ? false : null)
        setStatus("live")
      } catch (error) {
        if (cancelled) return
        const name = error instanceof DOMException ? error.name : ""
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable")
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else if (!stream.current) void start()
    }
    void start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
      stop()
    }
  }, [])

  // Look for a QR code a few times a second, on a smaller copy of the frame.
  useEffect(() => {
    if (status !== "live") return
    let stopped = false
    let timer = 0
    let read: Reader | null = null
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d", { willReadFrequently: true })
    const look = async () => {
      const element = video.current
      if (stopped || !context) return
      if (element && element.readyState >= 2 && element.videoWidth && !done.current) {
        read ??= await makeReader()
        const scale = Math.min(1, LOOK_SIZE / Math.max(element.videoWidth, element.videoHeight))
        canvas.width = Math.round(element.videoWidth * scale)
        canvas.height = Math.round(element.videoHeight * scale)
        context.drawImage(element, 0, 0, canvas.width, canvas.height)
        const hit = await read(canvas, context).catch(() => null)
        if (hit && !stopped && !done.current) {
          done.current = true
          setFound(onScreen(hit.points.map((p) => ({ x: p.x / scale, y: p.y / scale })), element, root.current))
          play("success")
          navigator.vibrate?.(25)
          timer = window.setTimeout(() => report.current({ kind: "code", text: hit.text }), 420)
          return
        }
      }
      timer = window.setTimeout(look, SCAN_EVERY)
    }
    void look()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [status])

  async function take() {
    const element = video.current
    if (!element?.videoWidth || done.current) return
    done.current = true
    setFlash(true)
    play("tap")
    const canvas = document.createElement("canvas")
    canvas.width = element.videoWidth
    canvas.height = element.videoHeight
    canvas.getContext("2d")?.drawImage(element, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
    if (!blob) {
      done.current = false
      setFlash(false)
      return
    }
    onResult({ kind: "photo", file: new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }) })
  }

  async function switchLight() {
    const track = stream.current?.getVideoTracks()[0]
    if (!track || torch === null) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      play(torch ? "toggleOff" : "toggleOn")
      setTorch(!torch)
    } catch {
      setTorch(null)
    }
  }

  const blocked = status === "denied" || status === "unavailable"

  return (
    <div ref={root} className="relative h-full w-full select-none">
      <video ref={video} playsInline muted autoPlay aria-hidden
        className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-300", status === "live" ? "opacity-100" : "opacity-0")} />
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 bg-white transition-opacity duration-300 ease-out", flash ? "opacity-70" : "opacity-0")} />

      {!blocked && <Brackets found={found} />}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-linear-to-b from-black/45 to-transparent px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-8">
        <button type="button" onClick={() => { play("close"); onClose() }} aria-label="Close scanner" className={GLASS}>
          <X className="size-5" strokeWidth={2.2} />
        </button>
        <span aria-live="polite" className="rounded-full bg-black/35 px-3 py-1.5 text-[0.8125rem] font-medium backdrop-blur-md">
          {found ? "Got it" : status === "live" ? "Point at a receipt or a QR code" : status === "starting" ? "Starting the camera…" : "Camera is off"}
        </span>
        <span className="size-11" aria-hidden />
      </div>

      {status === "starting" && <Loader2 aria-hidden className="absolute top-1/2 left-1/2 size-7 -translate-1/2 animate-spin text-white/70" />}

      {blocked && (
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 space-y-2 text-center">
          <p className="text-[1.0625rem] font-semibold">{status === "denied" ? "Faldo can't use the camera" : "No camera to use here"}</p>
          <p className="text-sm leading-relaxed text-white/75">
            {status === "denied"
              ? "Allow the camera when your phone asks. If you said no before, turn it on for Safari in your iPhone's Settings, then open the scanner again."
              : "You can still choose a photo or screenshot of your receipt."}
          </p>
          <button type="button" onClick={() => photos.current?.click()}
            className="pressable mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[0.9375rem] font-semibold text-black">
            <Images className="size-4" strokeWidth={2.2} /> Choose a photo instead
          </button>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-around bg-linear-to-t from-black/50 to-transparent px-6 pt-10 pb-[calc(env(safe-area-inset-bottom)+1.75rem)]">
        <input ref={photos} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden
          onChange={(e) => { const file = e.target.files?.[0]; if (file) { done.current = true; onResult({ kind: "photo", file }) } }} />
        <button type="button" onClick={() => photos.current?.click()} aria-label="Choose a photo" className={GLASS}>
          <Images className="size-5" strokeWidth={2} />
        </button>
        <button type="button" onClick={take} disabled={status !== "live"} aria-label="Take the receipt"
          className="pressable flex size-[4.5rem] items-center justify-center rounded-full border-4 border-white disabled:opacity-40">
          <span className="size-[3.6rem] rounded-full bg-white" />
        </button>
        {torch === null ? <span className="size-11" aria-hidden /> : (
          <button type="button" onClick={switchLight} aria-label={torch ? "Turn off the light" : "Turn on the light"} aria-pressed={torch}
            className={cn(GLASS, torch && "bg-white text-black hover:bg-white")}>
            {torch ? <FlashlightOff className="size-5" strokeWidth={2} /> : <Flashlight className="size-5" strokeWidth={2} />}
          </button>
        )}
      </div>
    </div>
  )
}

// Missing on pages that aren't secure (http) and in some in-app browsers.
const cameraSupported = () => typeof navigator.mediaDevices?.getUserMedia === "function"

const GLASS = "pressable flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md hover:bg-white/25"

/** Where the code's corners sit on screen: the video is scaled to cover the screen, so map through that. */
function onScreen(points: Point[], element: HTMLVideoElement, container: HTMLElement | null): Box | null {
  if (!container) return null
  const rect = element.getBoundingClientRect()
  const scale = Math.max(rect.width / element.videoWidth, rect.height / element.videoHeight)
  const offsetX = (rect.width - element.videoWidth * scale) / 2
  const offsetY = (rect.height - element.videoHeight * scale) / 2
  const xs = points.map((p) => p.x * scale + offsetX)
  const ys = points.map((p) => p.y * scale + offsetY)
  const pad = 14
  const left = Math.min(...xs) - pad
  const top = Math.min(...ys) - pad
  return { left, top, width: Math.max(...xs) + pad - left, height: Math.max(...ys) + pad - top }
}

// The resting frame, tall like a receipt, a little above the middle so the shutter never covers it.
const FRAME: React.CSSProperties = { left: "calc(50% - min(37vw, 10rem))", top: "calc(46% - min(48vw, 13rem))", width: "min(74vw, 20rem)", height: "min(96vw, 26rem)" }

/** The four rounded corners: a frame for the receipt, closing in on a QR code (in green) once one is found. */
function Brackets({ found }: { found: Box | null }) {
  const corner = "absolute size-11 border-current"
  return (
    <div aria-hidden style={found ?? FRAME}
      className={cn("pointer-events-none absolute transition-[left,top,width,height,color] duration-300 ease-(--ease-out-quint)", found ? "text-[#34c759]" : "text-white")}>
      <span className={cn(corner, "top-0 left-0 rounded-tl-[1.4rem] border-t-[5px] border-l-[5px]")} />
      <span className={cn(corner, "top-0 right-0 rounded-tr-[1.4rem] border-t-[5px] border-r-[5px]")} />
      <span className={cn(corner, "bottom-0 left-0 rounded-bl-[1.4rem] border-b-[5px] border-l-[5px]")} />
      <span className={cn(corner, "right-0 bottom-0 rounded-br-[1.4rem] border-r-[5px] border-b-[5px]")} />
    </div>
  )
}
