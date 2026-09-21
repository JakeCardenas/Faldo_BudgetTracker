"use client"

import Link from "next/link"
import { ArrowLeftRight, Banknote, ChevronLeft, ChevronRight, CreditCard, Eye, Landmark, MoreHorizontal, Pencil, PiggyBank, Plus, Smartphone, Wallet, type LucideIcon } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ACCOUNT_PALETTE } from "@/lib/account-templates"
import { ACCOUNT_TYPE_LABELS, formatMoney } from "@/lib/format"
import type { Account, AccountType } from "@/lib/types"
import { cn } from "@/lib/utils"

export const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote, bank: Landmark, e_wallet: Smartphone, credit_card: CreditCard, savings: PiggyBank, custom: Wallet,
}

export function accountColor(account: Account, index = 0) {
  return account.color ?? ACCOUNT_PALETTE[index % ACCOUNT_PALETTE.length]
}

/** Money set aside rather than spent day to day gets its own look. Cards are never "set aside" money. */
export function isSetAside(account: Account) {
  return account.type === "savings" || (!account.is_spendable && account.type !== "credit_card")
}

/** Relative luminance of a #rrggbb colour, to choose light or dark text on it. */
function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function AccountBadge({ account, className }: { account: Account; className?: string }) {
  const color = accountColor(account)
  const Icon = ACCOUNT_ICONS[account.type] ?? Wallet
  const dark = luminance(color) > 0.36
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", dark ? "text-[#101411]" : "text-white", className)} style={{ backgroundColor: color }}>
      <Icon className="size-[1.1rem]" strokeWidth={1.9} />
    </span>
  )
}

export interface AccountActions {
  onEdit: (account: Account) => void
  onAdd: (account: Account, mode: "expense" | "income" | "transfer") => void
}

type CardSize = "sm" | "md" | "lg"

const SIZES: Record<CardSize, string> = {
  sm: "h-[8rem] p-3.5",
  md: "h-[9.75rem] w-full p-4",
  lg: "aspect-[1.586] w-full max-w-[24rem] p-5",
}

/**
 * A physical-feeling card for a manually tracked account. Shows only safe details: name, bank,
 * the last four digits if the person chose to add them, the balance and a card's limit.
 */
export function AccountCard({ account, index = 0, actions, jiggle, onMove, canMoveBack, canMoveForward, pressHandlers, size = "sm", large, className, fluid, static: isStatic }: {
  account: Account
  index?: number
  actions?: AccountActions
  jiggle?: boolean
  onMove?: (direction: -1 | 1) => void
  canMoveBack?: boolean
  canMoveForward?: boolean
  pressHandlers?: React.HTMLAttributes<HTMLElement>
  size?: CardSize
  large?: boolean
  className?: string
  /** Render without a link, for previews. */
  static?: boolean
  /** A rail card that fills its grid cell on desktop. */
  fluid?: boolean
}) {
  const variant: CardSize = large ? "lg" : size
  const color = accountColor(account, index)
  const Icon = ACCOUNT_ICONS[account.type] ?? Wallet
  const isCredit = account.type === "credit_card"
  const setAside = isSetAside(account)
  const owed = isCredit ? Math.max(0, -account.balance_minor) : 0
  const limit = account.credit_limit_minor ?? 0
  const usedPct = limit > 0 ? Math.min(100, (owed / limit) * 100) : 0
  const subtitle = setAside ? (account.is_spendable ? "Savings" : "Set aside") : account.institution && account.institution !== account.name
    ? account.institution : ACCOUNT_TYPE_LABELS[account.type]
  const onColor = !setAside
  const darkText = onColor && luminance(color) > 0.36
  const ink = setAside ? "text-foreground" : darkText ? "text-[#101411]" : "text-white"
  const soft = setAside ? "text-muted-foreground" : darkText ? "text-[#101411]/70" : "text-white/80"

  const surfaceStyle: React.CSSProperties = setAside
    ? {
        backgroundColor: `color-mix(in oklab, ${color} 9%, var(--card))`,
        backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 9%, transparent) 0 1px, transparent 1px 9px)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 24%, transparent), var(--shadow-card)`,
      }
    : {
        backgroundImage: [
          "radial-gradient(120% 110% at 100% 0%, rgb(255 255 255 / 0.2), transparent 48%)",
          "radial-gradient(90% 80% at 0% 100%, rgb(0 0 0 / 0.22), transparent 62%)",
          `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 72%, #0b0f0c))`,
        ].join(","),
        boxShadow: `0 14px 30px -18px color-mix(in oklab, ${color} 80%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.18)`,
      }

  const amount = isCredit ? owed : account.balance_minor
  const body = (
    <>
      <span aria-hidden className={cn("pointer-events-none absolute rounded-full border-[1.25rem]",
        variant === "sm" ? "-right-12 -bottom-16 size-36" : variant === "md" ? "-right-12 -bottom-20 size-44" : "-right-16 -bottom-24 size-64",
        setAside ? "border-foreground/[0.035]" : darkText ? "border-black/[0.06]" : "border-white/[0.08]")} />
      <span aria-hidden className={cn("pointer-events-none absolute rounded-full border",
        variant === "sm" ? "-right-4 -bottom-8 size-20" : variant === "md" ? "-right-3 -bottom-10 size-24" : "-right-4 -bottom-12 size-36",
        setAside ? "border-foreground/[0.06]" : darkText ? "border-black/[0.08]" : "border-white/[0.14]")} />
      <div className={cn("relative flex min-w-0 items-center gap-2.5", actions && "pr-8")}>
        <span className={cn("flex shrink-0 items-center justify-center rounded-full", variant === "lg" ? "size-10" : "size-8",
          setAside ? "text-white" : darkText ? "bg-black/10" : "bg-white/18")}
          style={setAside ? { backgroundColor: color } : undefined}>
          <Icon className={variant === "lg" ? "size-5" : "size-4"} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className={cn("truncate font-semibold tracking-[-0.01em]", variant === "lg" ? "text-lg" : "text-[0.9375rem]")}>{account.name}</p>
          <p className={cn("truncate text-xs", soft)}>{subtitle}{account.currency !== "PHP" && `, ${account.currency}`}</p>
        </div>
      </div>
      <div className="relative min-w-0">
        {isCredit && limit > 0 && variant !== "sm" && (
          <div className="mb-2">
            <div className={cn("h-1 overflow-hidden rounded-full", darkText ? "bg-black/12" : "bg-white/22")}>
              <div className={cn("h-full rounded-full", darkText ? "bg-[#101411]/80" : "bg-white")} style={{ width: `${usedPct}%` }} />
            </div>
            <p className={cn("tabular mt-1 text-[0.6875rem]", soft)}>{formatMoney(limit - owed)} of {formatMoney(limit)} limit left</p>
          </div>
        )}
        <p className={cn("text-xs", soft)}>{isCredit ? "Owed" : setAside ? "Saved" : "Balance"}</p>
        <div className="flex items-end justify-between gap-2">
          <p className={cn("tabular truncate font-semibold tracking-[-0.03em]",
            variant === "lg" ? "text-[2.125rem] leading-tight" : variant === "md" ? "text-[1.5rem] leading-tight" : "text-[1.1875rem] leading-snug",
            setAside && !isCredit && account.balance_minor < 0 && "text-expense")}>
            {formatMoney(amount, account.currency)}
          </p>
          {account.card_last4 && variant !== "sm" && (
            <p className={cn("tabular shrink-0 pb-1 text-[0.8125rem] tracking-[0.08em]", soft)} aria-label={`Ends in ${account.card_last4}`}>•••• {account.card_last4}</p>
          )}
        </div>
      </div>
    </>
  )

  const surface = cn("relative flex flex-col justify-between overflow-hidden rounded-2xl select-none-touch", ink, SIZES[variant], variant === "lg" && "rounded-3xl")

  return (
    <div className={cn("relative shrink-0", variant === "md" && (fluid ? "w-[15.5rem] lg:w-full" : "w-[15.5rem]"), variant === "lg" && "w-full max-w-[24rem]", jiggle && "animate-jiggle", className)} style={jiggle ? { animationDelay: `${(index % 3) * -90}ms` } : undefined}>
      {isStatic ? (
        <div className={surface} style={surfaceStyle}>{body}</div>
      ) : jiggle ? (
        <div {...pressHandlers} className={cn(surface, "ring-2 ring-primary/50")} style={surfaceStyle}>{body}</div>
      ) : (
        <Link href={`/accounts/${account.id}`} {...pressHandlers} style={surfaceStyle}
          className={cn(surface, "pressable transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}>
          {body}
        </Link>
      )}
      {actions && !jiggle && !isStatic && (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`${account.name} options`}
            className={cn("absolute top-3 right-3 flex size-8 items-center justify-center rounded-full transition-colors",
              setAside ? "text-muted-foreground hover:bg-foreground/5" : darkText ? "text-[#101411]/75 hover:bg-black/10" : "text-white/85 hover:bg-white/15")}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild><Link href={`/accounts/${account.id}`}><Eye /> View history</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAdd(account, "expense")}><Plus /> Add expense</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAdd(account, "income")}><Plus /> Add income</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAdd(account, "transfer")}><ArrowLeftRight /> Transfer from here</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onEdit(account)}><Pencil /> Edit account</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {jiggle && onMove && (
        <div className="absolute inset-x-0 -bottom-3.5 flex justify-center gap-1.5">
          <button type="button" disabled={!canMoveBack} onClick={() => onMove(-1)} aria-label={`Move ${account.name} earlier`}
            className="pressable flex size-8 items-center justify-center rounded-full bg-popover text-foreground shadow-(--shadow-float) disabled:opacity-30"><ChevronLeft className="size-4" /></button>
          <button type="button" disabled={!canMoveForward} onClick={() => onMove(1)} aria-label={`Move ${account.name} later`}
            className="pressable flex size-8 items-center justify-center rounded-full bg-popover text-foreground shadow-(--shadow-float) disabled:opacity-30"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
