"use client"

import { X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

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
        className={cn("flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-[1.75rem] bg-background p-0 ring-0",
          "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none",
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl", className)}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/25 sm:hidden" aria-hidden />
        <div className="flex items-start gap-3 px-5 pt-3 pb-3 sm:pt-5">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-extrabold tracking-tight">{title}</DialogTitle>
            {description ? <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
              : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close"
            className="pressable flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </DialogContent>
    </Dialog>
  )
}
