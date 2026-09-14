"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronsUpDown, LogOut, Settings, Sparkles } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { useMe } from "@/lib/queries"
import { cn } from "@/lib/utils"

export function UserMenu({ variant = "compact" }: { variant?: "sidebar" | "compact" }) {
  const { data: me } = useMe()
  const router = useRouter()
  const initials = (me?.display_name ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined)
    router.replace("/login")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
          variant === "sidebar" ? "w-full p-2 hover:bg-sidebar-accent" : "p-0.5",
        )}
        aria-label="Account menu"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-mint text-xs font-semibold text-mint-foreground">{initials}</span>
        {variant === "sidebar" && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me?.display_name ?? " "}</span>
              <span className="block truncate text-xs text-muted-foreground">{me?.email ?? " "}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "sidebar" ? "start" : "end"} side={variant === "sidebar" ? "top" : "bottom"} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{me?.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">{me?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/assistant"><Sparkles /> Ask Faldo</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
