"use client"

import { RefreshCw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card-surface mt-4 flex flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-danger-soft text-destructive"><TriangleAlert className="size-5" /></span>
      <div className="space-y-1">
        <p className="font-medium">Something went wrong on this page</p>
        <p className="text-sm text-muted-foreground">Your data is safe. Try again, and if it keeps happening, refresh the app.</p>
      </div>
      <Button variant="outline" onClick={reset}><RefreshCw /> Try again</Button>
    </div>
  )
}
