import { Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"

/**
 * A request that failed, said plainly with a way to try again: never an empty list, a zero or a skeleton that spins
 * forever, so nobody mistakes "couldn't load" for "nothing there".
 */
export function LoadError({ what, detail, onRetry, retrying }: { what: string; detail?: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">
      <span className="flex-1">Couldn&apos;t load {what}.{detail ? ` ${detail}` : ""}</span>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying && <Loader2 className="animate-spin" />} Try again
      </Button>
    </div>
  )
}
