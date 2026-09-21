import Link from "next/link"
import { Panda } from "@/components/brand/panda"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Panda pose="sleep" priority sizes="200px" className="w-44" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">This page is fast asleep</h1>
        <p className="text-sm text-muted-foreground">It doesn&apos;t exist or has moved. Let&apos;s head back.</p>
      </div>
      <Button asChild size="lg"><Link href="/">Back to Home</Link></Button>
    </div>
  )
}
