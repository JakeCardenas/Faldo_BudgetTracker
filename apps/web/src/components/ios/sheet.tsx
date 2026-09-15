"use client"

import { X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export const SHEET_CLASSES = "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:data-open:slide-in-from-bottom-10 max-sm:data-open:zoom-in-100 max-sm:data-closed:slide-out-to-bottom-10 max-sm:data-closed:zoom-out-100"

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}
        className={cn("flex max-h-[92dvh] flex-col gap-0 overflow-hidden bg-popover p-0", SHEET_CLASSES,
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl", className)}>
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-foreground/15 sm:hidden" aria-hidden />
        <div className="flex items-start gap-3 px-5 pt-3 pb-4 sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription className="mt-1 text-[0.8125rem]">{description}</DialogDescription>
              : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close"
            className="pressable -mt-0.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
        {footer && <div className="border-t px-5 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  )
}
