import Image from "next/image"
import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image src="/brand/logo-96.png" alt="" width={96} height={96} priority
      className={cn("size-8 shrink-0 rounded-[28%] shadow-(--shadow-card)", className)} />
  )
}

export function MascotArt({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image src="/brand/faldo-mascot.png" alt="Faldo mascot" width={625} height={640} priority={priority}
      className={cn("h-auto w-28 select-none", className)} draggable={false} />
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-8" />
      <span className="text-[1.1rem] font-extrabold tracking-tight text-foreground">Faldo</span>
    </span>
  )
}
