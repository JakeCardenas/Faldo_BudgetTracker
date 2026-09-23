"use client"

import { useRef } from "react"
import { X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// On phones a dialog becomes a bottom sheet that rises the full height with the iOS drawer curve and
// leaves faster than it came. It doesn't fade: a sheet is a physical card, not a ghost.
export const SHEET_CLASSES = "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:ease-[cubic-bezier(0.32,0.72,0,1)] max-sm:data-open:duration-[400ms] max-sm:data-closed:duration-[250ms] max-sm:data-open:fade-in-100 max-sm:data-closed:fade-out-100 max-sm:data-open:slide-in-from-bottom max-sm:data-open:zoom-in-100 max-sm:data-closed:slide-out-to-bottom max-sm:data-closed:zoom-out-100"

const DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)"
const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 0.11 // px per ms, a flick

// Pull a sheet down by its grabber or header to close it, like iOS. The sheet follows the finger, resists being
// pulled up, and either closes (far enough, or flicked) or springs back. Only on phones, where it is a sheet.
export function useSheetDrag(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; start: number; startT: number; last: number; lastT: number; v: number } | null>(null)

  function place(y: number, animate: boolean) {
    const el = ref.current
    if (!el) return
    const overlay = el.previousElementSibling as HTMLElement | null
    const ease = animate ? `300ms ${DRAWER}` : "0s"
    el.style.transition = `transform ${ease}`
    el.style.transform = y ? `translate3d(0, ${y}px, 0)` : ""
    if (overlay?.dataset.slot === "dialog-overlay") {
      overlay.style.transition = `opacity ${ease}`
      overlay.style.opacity = y > 0 ? String(Math.max(0, 1 - y / el.offsetHeight)) : ""
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0 || !window.matchMedia("(max-width: 639px)").matches) return
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [role=radio], [role=tab]")) return
    drag.current = { id: e.pointerId, start: e.clientY, startT: e.timeStamp, last: e.clientY, lastT: e.timeStamp, v: 0 }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* moves still arrive while over the header */ }
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.v = (e.clientY - d.last) / dt
    d.last = e.clientY
    d.lastT = e.timeStamp
    const dy = e.clientY - d.start
    place(dy < 0 ? -Math.sqrt(-dy) * 2 : dy, false)
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    const dy = e.clientY - d.start
    const flicked = d.v > DISMISS_VELOCITY && e.timeStamp - d.lastT < 80
    if (dy > DISMISS_DISTANCE || (dy > 12 && (flicked || dy / (e.timeStamp - d.startT) > DISMISS_VELOCITY * 4))) {
      onClose() // the exit animation carries on from where the finger let go
      setTimeout(() => { if (ref.current?.dataset.state === "open") place(0, true) }, 60)
      return
    }
    place(0, true)
  }

  const handle = {
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp,
    className: "max-sm:touch-none max-sm:select-none",
  }
  return { ref, handle }
}

export function SheetGrabber() {
  return <div className="mx-auto h-5 w-full pt-2 sm:hidden" aria-hidden><div className="mx-auto h-1 w-9 rounded-full bg-foreground/15" /></div>
}

export function IosSheet({ open, onOpenChange, title, description, children, footer, className, size = "md" }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const { ref, handle } = useSheetDrag(() => onOpenChange(false))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={ref} showCloseButton={false}
        className={cn("flex max-h-[92dvh] flex-col gap-0 overflow-hidden bg-popover p-0 max-sm:rounded-t-[1.75rem]", SHEET_CLASSES,
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl", className)}>
        <div {...handle}>
          <SheetGrabber />
          <div className="flex items-start gap-3 px-5 pt-1 pb-4 sm:px-6 sm:pt-5">
            <div className="min-w-0 flex-1">
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription className="mt-1 text-[0.8125rem]">{description}</DialogDescription>
                : <DialogDescription className="sr-only">{title}</DialogDescription>}
            </div>
            <button type="button" onClick={() => onOpenChange(false)} aria-label="Close"
              className="pressable hit -mt-0.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="size-4" strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 sm:px-6 sm:pb-6", footer ? "pb-5" : "pb-[calc(1.25rem+env(safe-area-inset-bottom))]")}>{children}</div>
        {footer && <div className="border-t px-5 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  )
}
