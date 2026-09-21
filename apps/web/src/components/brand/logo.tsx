import Image from "next/image"
import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image src="/brand/faldo-panda-512.png" alt="" width={96} height={96} priority unoptimized
      className={cn("size-8 shrink-0 drop-shadow-[0_2px_4px_rgb(30_58_36/0.25)]", className)} />
  )
}

export function MascotArt({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image src="/brand/faldo-mascot.png" alt="Faldo mascot" width={625} height={640} priority={priority}
      className={cn("h-auto w-28 select-none", className)} draggable={false} />
  )
}

export function Logo({ className, tone = "default" }: { className?: string; tone?: "default" | "light" }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-8" />
      <span className={cn("font-brand text-[1.1rem] font-extrabold tracking-tight", tone === "light" ? "text-white" : "text-foreground")}>Faldo</span>
    </span>
  )
}
