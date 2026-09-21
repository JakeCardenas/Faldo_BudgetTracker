import type { Account, AccountType } from "@/lib/types"

/**
 * Philippine banks and e-wallets people can pick when adding an account.
 *
 * Logos: Faldo ships no provider logos. To show one, add the provider's official or licensed logo file
 * to `public/brand/providers/<id>.svg` (or .png) and set `logo` to its path below. Never redraw,
 * approximate or generate a logo; without a file, a generic account icon is shown in the brand colour.
 */
export interface Provider {
  id: string
  name: string
  kinds: AccountType[]
  color: string
  logo?: string
}

const BANK: AccountType[] = ["bank", "savings", "credit_card"]

export const PROVIDERS: Provider[] = [
  { id: "gcash", name: "GCash", kinds: ["e_wallet"], color: "#1b63d6" },
  { id: "maya", name: "Maya", kinds: ["e_wallet", "savings", "credit_card"], color: "#0f9d6b" },
  { id: "grabpay", name: "GrabPay", kinds: ["e_wallet"], color: "#00a650" },
  { id: "shopeepay", name: "ShopeePay", kinds: ["e_wallet"], color: "#e5532d" },
  { id: "coinsph", name: "Coins.ph", kinds: ["e_wallet"], color: "#1f4fd8" },
  { id: "bdo", name: "BDO", kinds: BANK, color: "#1e3f94" },
  { id: "bpi", name: "BPI", kinds: BANK, color: "#b3222a" },
  { id: "metrobank", name: "Metrobank", kinds: BANK, color: "#23408f" },
  { id: "unionbank", name: "UnionBank", kinds: BANK, color: "#e07800" },
  { id: "landbank", name: "Landbank", kinds: BANK, color: "#128a44" },
  { id: "securitybank", name: "Security Bank", kinds: BANK, color: "#0a8fc7" },
  { id: "rcbc", name: "RCBC", kinds: BANK, color: "#1f5aa8" },
  { id: "pnb", name: "PNB", kinds: BANK, color: "#0b3d91" },
  { id: "chinabank", name: "China Bank", kinds: BANK, color: "#a61c2e" },
  { id: "eastwest", name: "EastWest", kinds: BANK, color: "#6d2077" },
  { id: "cimb", name: "CIMB", kinds: ["bank", "savings"], color: "#8a1538" },
  { id: "maribank", name: "MariBank", kinds: ["bank", "savings"], color: "#e8742a" },
  { id: "seabank", name: "SeaBank", kinds: ["bank", "savings"], color: "#f06a1d" },
  { id: "gotyme", name: "GoTyme", kinds: ["bank", "savings"], color: "#11a39a" },
  { id: "tonik", name: "Tonik", kinds: ["bank", "savings"], color: "#6a34d1" },
]

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

/** The provider an account belongs to, matched on its institution (or name). */
export function providerFor(account: Pick<Account, "institution" | "name">): Provider | undefined {
  const keys = [account.institution, account.name].filter(Boolean).map((v) => normalize(v as string))
  return PROVIDERS.find((p) => keys.some((k) => k === normalize(p.name) || k.startsWith(normalize(p.name)) || k.startsWith(p.id)))
}

export function providersFor(kind: AccountType) {
  return PROVIDERS.filter((p) => p.kinds.includes(kind))
}
