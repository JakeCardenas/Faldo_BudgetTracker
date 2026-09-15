import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-8", className)}>
      <rect width="64" height="64" rx="18" fill="var(--primary)" />
      <path d="M22 46V19h22" stroke="#f5fbf3" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M22 32.5h15" stroke="#b9dca9" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      <span className="text-[1.05rem] font-semibold tracking-tight text-foreground">Faldo</span>
    </span>
  )
}
