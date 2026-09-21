"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleUserRound, LogOut, Settings } from "lucide-react"
import { initialsOf } from "@/components/layout/mobile-nav"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { useMe } from "@/lib/queries"

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground ${className ?? "size-8 text-[0.6875rem]"}`}>
      {initialsOf(name)}
    </span>
  )
}

export function useLogout() {
  const router = useRouter()
  return async () => {
    await api.post("/auth/logout").catch(() => undefined)
    router.replace("/login")
    router.refresh()
  }
}

export function UserMenu() {
  const { data: me } = useMe()
  const logout = useLogout()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/40" aria-label="Account menu">
        <Avatar name={me?.display_name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{me?.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">{me?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/you"><CircleUserRound /> You</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
