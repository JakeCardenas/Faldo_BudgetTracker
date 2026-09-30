"use client"

import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { CircleUserRound, LogOut, Settings } from "lucide-react"
import { toast } from "sonner"
import { initialsOf } from "./mobile-nav"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu"
import { forgetPushOnThisDevice } from "@/features/push-notifications"
import { useMe, signOut } from "@/entities/session"

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground ${className ?? "size-8 text-[0.6875rem]"}`}>
      {initialsOf(name)}
    </span>
  )
}

const post = (path: string) => fetch(path, { method: "POST", credentials: "same-origin", headers: { "x-faldo-client": "web" } })

/** Signing out forgets everything this tab knows about the person, even when the server can't be reached. */
export function useLogout() {
  const qc = useQueryClient()
  return () => signOut(qc, {
    unsubscribePush: forgetPushOnThisDevice,
    revokeSession: async () => { if (!(await post("/api/v1/auth/logout")).ok) throw new Error("not signed out") },
    dropCookie: () => post("/logout"),
    afterward: () => toast.dismiss(),
    navigate: (path) => window.location.replace(path),
  })
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
        <DropdownMenuItem asChild><Link href="/you"><CircleUserRound /> Profile</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
