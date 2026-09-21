"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowLeftRight, Banknote, CreditCard, Eye, Landmark, MoreHorizontal, Nfc, Pencil, PiggyBank, Plus, Smartphone, Wallet, type LucideIcon } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ACCOUNT_PALETTE } from "@/lib/account-templates"
import { ACCOUNT_TYPE_LABELS, formatMoney } from "@/lib/format"
import { providerFor, type LogoFrame, type Provider, type ProviderLogo } from "@/lib/providers"
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

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Relative luminance of a #rrggbb colour, to choose light or dark text on it. */
function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

const WHITE_LOGO: React.CSSProperties = { filter: "brightness(0) invert(1)" }

/**
 * An official provider logo, framed to one region of the file (the whole artwork by default). The
 * file itself is never edited, only framed. `white` shows the reversed version used on dark card
 * faces. Size it by height; the width follows the frame's proportions.
 */
export function ProviderLogoImage({ logo, name, white, frame, height, maxWidth, className }: {
  logo: ProviderLogo
  name: string
  white?: boolean
  frame?: LogoFrame
  /** CSS height. Wide wordmarks shrink to stay within `maxWidth`. */
  height?: string
  maxWidth?: string
  className?: string
}) {
  const [x0, y0, x1, y1] = frame ?? logo.box ?? [0, 0, 1, 1]
  const w = x1 - x0
  const h = y1 - y0
  const ratio = (w * logo.width) / (h * logo.height)
  const size = height ? (maxWidth ? `min(${height}, calc(${maxWidth} / ${ratio.toFixed(3)}))` : height) : undefined
  return (
    <span className={cn("relative block shrink-0 overflow-hidden", className)} style={{ aspectRatio: ratio, height: size }}>
      <Image src={logo.src} alt={`${name} logo`} width={logo.width} height={logo.height} unoptimized draggable={false}
        className="absolute max-w-none select-none"
        style={{ width: `${100 / w}%`, height: `${100 / h}%`, left: `${(-x0 / w) * 100}%`, top: `${(-y0 / h) * 100}%`, ...(white ? WHITE_LOGO : undefined) }} />
    </span>
  )
}

/**
 * A provider's official logo symbol on a white disc when a logo file exists (see lib/providers.ts),
 * otherwise a generic icon in the provider's colour. Never a drawn or generated logo.
 */
export function ProviderMark({ provider, fallback: Fallback = Wallet, color, className }: {
  provider?: Provider
  fallback?: LucideIcon
  color?: string
  className?: string
}) {
  if (provider?.logo) {
    return (
      <span className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white px-1.5 ring-1 ring-black/5", className)}>
        <ProviderLogoImage logo={provider.logo} name={provider.name} frame={provider.logo.symbol} className={provider.logo.symbol ? "h-[52%] max-w-full" : "h-[34%] max-w-full"} />
      </span>
    )
  }
  const tint = color ?? provider?.color ?? "#5b6b5e"
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", luminance(tint) > 0.36 ? "text-[#101411]" : "text-white", className)}
      style={{ backgroundColor: tint }}>
      <Fallback className="size-4" strokeWidth={1.9} />
    </span>
  )
}

/** `index` is the account's position, so a badge matches its card when no colour was chosen. */
export function AccountBadge({ account, index, className }: { account: Account; index?: number; className?: string }) {
  return <ProviderMark provider={providerFor(account)} fallback={ACCOUNT_ICONS[account.type] ?? Wallet} color={accountColor(account, index)} className={cn("size-10", className)} />
}

/** The ··· menu on an account card or tile. */
function AccountMenu({ account, actions, className }: { account: Account; actions: AccountActions; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`${account.name} options`}
        className={cn("flex size-8 items-center justify-center rounded-full transition-colors", className)}>
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
  )
}

export interface AccountActions {
  onEdit: (account: Account) => void
  onAdd: (account: Account, mode: "expense" | "income" | "transfer") => void
}

type CardSize = "md" | "lg"

/**
 * A generic payment chip, drawn with CSS. It appears on branded faces and on cards (credit cards, and
 * accounts the person gave a card's last four digits for). No card network mark is shown, since Faldo
 * doesn't know the network, and no cardholder name or card number: these are tracked by hand.
 */
function CardChip() {
  return (
    <span aria-hidden className="block aspect-[1.32] w-[clamp(1.85rem,10cqw,2.4rem)] rounded-[0.3rem] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]"
      style={{ backgroundImage: [
        "linear-gradient(90deg, transparent 31%, rgb(60 44 10 / 0.22) 31% 34%, transparent 34% 66%, rgb(60 44 10 / 0.22) 66% 69%, transparent 69%)",
        "linear-gradient(0deg, transparent 47%, rgb(60 44 10 / 0.22) 47% 53%, transparent 53%)",
        "linear-gradient(135deg, #f3e4b3, #cfb06a 55%, #eddaa0)",
      ].join(",") }} />
  )
}

/**
 * A card-shaped view of a manually tracked account, in the real ID-1 card proportion (85.6 × 54 mm).
 * It shows only safe details: name, bank, the last four digits if the person chose to add them, the
 * balance, and for a credit card what's used, what's available and the limit.
 */
export function AccountCard({ account, index = 0, actions, size = "md", large, className, fluid, fill, static: isStatic }: {
  account: Account
  index?: number
  actions?: AccountActions
  size?: CardSize
  large?: boolean
  className?: string
  /** Render without a link, for previews. */
  static?: boolean
  /** A rail card that fills its grid cell on desktop. */
  fluid?: boolean
  /** Always fill the parent's width (grids). */
  fill?: boolean
}) {
  const variant: CardSize = large ? "lg" : size
  const lg = variant === "lg"
  const color = accountColor(account, index)
  const Icon = ACCOUNT_ICONS[account.type] ?? Wallet
  const provider = providerFor(account)
  const isCredit = account.type === "credit_card"
  const setAside = isSetAside(account)
  const isCard = isCredit || Boolean(account.card_last4)
  const owed = isCredit ? Math.max(0, -account.balance_minor) : 0
  const limit = account.credit_limit_minor ?? 0
  const usedPct = limit > 0 ? Math.min(100, (owed / limit) * 100) : 0
  const subtitle = setAside ? (account.is_spendable ? "Savings" : "Set aside") : account.institution && account.institution !== account.name
    ? account.institution : ACCOUNT_TYPE_LABELS[account.type]
  const art = provider?.card
  const typeLabel = isCredit ? "Credit" : account.type === "savings" ? "Savings" : account.type === "bank" ? (account.card_last4 ? "Debit" : "Bank") : null
  const showName = !provider || normalizeName(account.name) !== normalizeName(provider.name)
  const darkText = art ? art.ink === "dark" : !setAside && luminance(color) > 0.36
  const plain = setAside && !art
  const ink = plain ? "text-foreground" : darkText ? "text-[#101411]" : "text-white"
  const soft = plain ? "text-muted-foreground" : darkText ? "text-[#101411]/70" : "text-white/80"
  const line = setAside ? "rgb(16 20 17 / 0.05)" : darkText ? "rgb(0 0 0 / 0.05)" : "rgb(255 255 255 / 0.07)"

  const surfaceStyle: React.CSSProperties = art
    ? {
        background: art.background,
        boxShadow: `0 16px 30px -20px color-mix(in oklab, ${art.shadow ?? provider!.color} 85%, #0b0f0c), 0 2px 6px -2px rgb(16 36 24 / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 0 0 1px rgb(255 255 255 / 0.06)`,
      }
    : setAside
    ? {
        backgroundColor: `color-mix(in oklab, ${color} 9%, var(--card))`,
        backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 9%, transparent) 0 1px, transparent 1px 9px)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 24%, transparent), var(--elevation-card)`,
      }
    : {
        backgroundImage: [
          // Cards get fine engraved arcs; e-wallets and cash keep two broad rings (drawn below).
          ...(isCard ? [`repeating-radial-gradient(circle at 110% -30%, transparent 0 11px, ${line} 11px 12px)`] : []),
          "linear-gradient(115deg, rgb(255 255 255 / 0.16), transparent 42%)",
          `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 70%, #0b0f0c))`,
        ].join(","),
        boxShadow: `0 16px 30px -20px color-mix(in oklab, ${color} 85%, #0b0f0c), 0 2px 6px -2px rgb(16 36 24 / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.2), inset 0 0 0 1px rgb(255 255 255 / 0.06)`,
      }

  const amount = isCredit ? owed : account.balance_minor
  const money = (
    <div className="relative min-w-0">
      <p className={cn("text-[clamp(0.75rem,3.9cqw,0.875rem)]", soft)}>{isCredit ? "Used" : setAside ? "Saved" : "Balance"}</p>
      <div className="flex items-end justify-between gap-2">
        <p className={cn("tabular truncate text-[clamp(1.375rem,8.8cqw,2.125rem)] leading-tight font-semibold tracking-[-0.03em]",
          plain && !isCredit && account.balance_minor < 0 && "text-expense")}>
          {formatMoney(amount, account.currency)}
        </p>
        {account.card_last4 && (
          <p className={cn("tabular shrink-0 pb-1 text-[clamp(0.75rem,3.9cqw,0.875rem)] tracking-[0.08em]", soft)} aria-label={`Ends in ${account.card_last4}`}>•••• {account.card_last4}</p>
        )}
      </div>
      {isCredit && limit > 0 && (
        <div className="mt-1.5">
          <div className={cn("h-1 overflow-hidden rounded-full", darkText ? "bg-black/12" : "bg-white/22")}>
            <div className={cn("h-full rounded-full", darkText ? "bg-[#101411]/80" : "bg-white")} style={{ width: `${usedPct}%` }} />
          </div>
          <p className={cn("tabular mt-1 truncate text-[clamp(0.6875rem,3.6cqw,0.8125rem)]", soft)}>{formatMoney(Math.max(0, limit - owed), account.currency)} available of {formatMoney(limit, account.currency)}</p>
        </div>
      )}
    </div>
  )
  const chip = (
    <div className="relative flex items-center gap-2">
      <CardChip />
      <Nfc aria-hidden className={cn("size-[clamp(1rem,5.6cqw,1.3rem)]", soft)} strokeWidth={1.8} />
    </div>
  )

  // A branded face: the provider's own card colours and logo, like the physical card, minus the
  // cardholder name and card number.
  const branded = art && provider && (
    <>
      {art.bigMark && provider.logo?.symbol && (
        <ProviderLogoImage logo={provider.logo} name={provider.name} frame={provider.logo.symbol} white
          className="pointer-events-none absolute top-1/2 -right-[6cqw] h-[54cqw] -translate-y-1/2 opacity-[0.16] drop-shadow-[0_0_18px_rgb(255_255_255/0.6)]" />
      )}
      <div className={cn("relative flex min-w-0 items-start justify-between gap-3", actions && "pr-8")}>
        <div className="min-w-0">
          {provider.logo ? (
            <ProviderLogoImage logo={provider.logo} name={provider.name} white={art.logoTone === "white"}
              frame={art.logoTone === "white" ? provider.logo.face : undefined} height="clamp(1.1rem, 7cqw, 1.55rem)" maxWidth="40cqw" />
          ) : (
            <p className="truncate text-[clamp(1rem,6cqw,1.3rem)] leading-tight font-bold tracking-[-0.02em]">{provider.name}</p>
          )}
          {showName && <p className={cn("mt-1 truncate text-[clamp(0.75rem,3.9cqw,0.875rem)]", soft)}>{account.name}</p>}
        </div>
        {typeLabel && <p className={cn("shrink-0 pt-0.5 text-[clamp(0.75rem,3.9cqw,0.875rem)] font-medium", soft)}>{typeLabel}</p>}
      </div>
      {chip}
      {money}
    </>
  )

  const body = branded || (
    <>
      {!isCard && !setAside && (
        <>
          <span aria-hidden className={cn("pointer-events-none absolute -right-[18cqw] -bottom-[28cqw] size-[68cqw] rounded-full border-[7cqw]",
            darkText ? "border-black/[0.06]" : "border-white/[0.08]")} />
          <span aria-hidden className={cn("pointer-events-none absolute -right-[4cqw] -bottom-[15cqw] size-[38cqw] rounded-full border",
            darkText ? "border-black/[0.08]" : "border-white/[0.14]")} />
        </>
      )}
      <div className={cn("relative flex min-w-0 items-center gap-2.5", actions && "pr-8")}>
        <span className={cn("flex size-[clamp(2rem,10.5cqw,2.5rem)] shrink-0 items-center justify-center rounded-full",
          setAside ? "text-white" : darkText ? "bg-black/10" : "bg-white/18")}
          style={setAside ? { backgroundColor: color } : undefined}>
          <Icon className="size-[clamp(1rem,5.2cqw,1.25rem)]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[clamp(0.9375rem,5.4cqw,1.125rem)] font-semibold tracking-[-0.01em]">{account.name}</p>
          <p className={cn("truncate text-[clamp(0.75rem,3.9cqw,0.875rem)]", soft)}>{subtitle}{account.currency !== "PHP" && `, ${account.currency}`}</p>
        </div>
      </div>
      {isCard && chip}
      {money}
    </>
  )

  const surface = cn("relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden select-none-touch", ink,
    "rounded-[clamp(1.125rem,6.5cqw,1.5rem)] p-[clamp(1rem,5.6cqw,1.375rem)]")

  return (
    <div className={cn("@container relative shrink-0", lg ? "w-full max-w-[24rem]" : fill ? "w-full" : fluid ? "w-[16.5rem] lg:w-full" : "w-[16.5rem]", className)}>
      {isStatic ? (
        <div className={surface} style={surfaceStyle}>{body}</div>
      ) : (
        <Link href={`/accounts/${account.id}`} style={surfaceStyle}
          className={cn(surface, "pressable transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}>
          {body}
        </Link>
      )}
      {actions && !isStatic && (
        <AccountMenu account={account} actions={actions}
          className={cn("absolute top-3 right-3", plain ? "text-muted-foreground hover:bg-foreground/5" : darkText ? "text-[#101411]/75 hover:bg-black/10" : "text-white/85 hover:bg-white/15")} />
      )}
    </div>
  )
}

const TILE_KIND: Record<AccountType, string> = {
  cash: "Cash", bank: "Debit", e_wallet: "E-wallet", credit_card: "Credit", savings: "Savings", custom: "Account",
}

/**
 * A compact account tile for the Wallet grid: the provider's colours and logo, a meta line, the balance
 * and, for a credit card, how much of the limit is used. Safe details only.
 */
export function AccountTile({ account, index = 0, actions }: { account: Account; index?: number; actions?: AccountActions }) {
  const color = accountColor(account, index)
  const provider = providerFor(account)
  const art = provider?.card
  const Icon = ACCOUNT_ICONS[account.type] ?? Wallet
  const isCredit = account.type === "credit_card"
  const plain = isSetAside(account) && !art
  const darkText = art ? art.ink === "dark" : !plain && luminance(color) > 0.36
  const ink = plain ? "text-foreground" : darkText ? "text-[#101411]" : "text-white"
  const soft = plain ? "text-muted-foreground" : darkText ? "text-[#101411]/70" : "text-white/80"
  const owed = isCredit ? Math.max(0, -account.balance_minor) : 0
  const limit = account.credit_limit_minor ?? 0
  const usedPct = limit > 0 ? Math.min(100, (owed / limit) * 100) : 0
  const meta = [TILE_KIND[account.type], account.currency, account.card_last4 ? `•••• ${account.card_last4}` : null].filter(Boolean).join(" • ")

  const style: React.CSSProperties = art
    ? { background: art.background, boxShadow: `0 12px 24px -16px color-mix(in oklab, ${art.shadow ?? provider!.color} 80%, #0b0f0c), inset 0 1px 0 rgb(255 255 255 / 0.18)` }
    : plain
    ? {
        backgroundColor: `color-mix(in oklab, ${color} 9%, var(--card))`,
        backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 9%, transparent) 0 1px, transparent 1px 9px)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 24%, transparent), var(--elevation-card)`,
      }
    : {
        backgroundImage: `linear-gradient(115deg, rgb(255 255 255 / 0.16), transparent 42%), linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 72%, #0b0f0c))`,
        boxShadow: `0 12px 24px -16px color-mix(in oklab, ${color} 80%, #0b0f0c), inset 0 1px 0 rgb(255 255 255 / 0.2)`,
      }

  return (
    <div className="relative min-w-0">
      <Link href={`/accounts/${account.id}`} style={style}
        className={cn("pressable flex aspect-[1.45] flex-col justify-between overflow-hidden rounded-[1.125rem] p-3.5 transition-transform select-none-touch hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", ink)}>
        <div className={cn("flex min-w-0 items-center gap-2", actions && "pr-7")}>
          {provider?.logo ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[0.625rem] bg-white px-1 shadow-[0_1px_2px_rgb(0_0_0/0.12)]">
              <ProviderLogoImage logo={provider.logo} name={provider.name} frame={provider.logo.symbol} className={provider.logo.symbol ? "h-[62%] max-w-full" : "h-[40%] max-w-full"} />
            </span>
          ) : (
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[0.625rem]", plain ? "text-white" : darkText ? "bg-black/10" : "bg-white/20")}
              style={plain ? { backgroundColor: color } : undefined}>
              <Icon className="size-4" strokeWidth={1.9} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[0.875rem] leading-tight font-bold">{account.name}</span>
            <span className={cn("block truncate text-[0.6875rem] leading-tight", soft)}>{meta}</span>
          </span>
        </div>
        <div className="min-w-0">
          {isCredit && limit > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <span className={cn("text-[0.625rem] font-bold tracking-[0.08em] uppercase", soft)}>Used credit</span>
                <span className={cn("h-1 flex-1 overflow-hidden rounded-full", darkText ? "bg-black/15" : "bg-white/30")}>
                  <span className={cn("block h-full rounded-full", darkText ? "bg-[#101411]/80" : "bg-white")} style={{ width: `${usedPct}%` }} />
                </span>
              </div>
              <p className={cn("tabular mt-0.5 flex justify-between gap-2 text-[0.625rem]", soft)}>
                <span>{Math.round(usedPct)}% used</span><span className="truncate">{formatMoney(Math.max(0, limit - owed), account.currency)} left</span>
              </p>
            </>
          ) : (
            <p className={cn("text-[0.625rem] font-bold tracking-[0.08em] uppercase", soft)}>{isCredit ? "Used" : plain ? "Saved" : "Balance"}</p>
          )}
          <p className={cn("tabular truncate text-[1.1875rem] leading-tight font-extrabold tracking-[-0.03em]", plain && account.balance_minor < 0 && "text-expense")}>
            {formatMoney(isCredit ? owed : account.balance_minor, account.currency)}
          </p>
        </div>
      </Link>
      {actions && (
        <AccountMenu account={account} actions={actions}
          className={cn("absolute top-2 right-2 size-7", plain ? "text-muted-foreground hover:bg-foreground/5" : darkText ? "text-[#101411]/75 hover:bg-black/10" : "text-white/85 hover:bg-white/15")} />
      )}
    </div>
  )
}
