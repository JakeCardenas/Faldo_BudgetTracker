import Link from "next/link"
import { LogoMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <LogoMark className="size-12" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">The page you're looking for doesn't exist or has moved.</p>
      </div>
      <Button asChild><Link href="/">Back to home</Link></Button>
    </div>
  )
}
