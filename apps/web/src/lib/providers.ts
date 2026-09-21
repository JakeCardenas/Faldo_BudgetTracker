import type { Account, AccountType } from "@/lib/types"

/**
 * Philippine banks and e-wallets people can pick when adding an account.
 *
 * Logos: only official logo files, stored in `public/brand/providers/<id>.svg` with their source noted
 * in that folder's SOURCES.md. Never redraw, approximate or generate a logo; without a file, the
 * provider's name is shown as plain text and lists fall back to a generic icon in the brand colour.
 *
 * Card faces: `card` echoes the colours and pattern of the provider's real card (researched from the
 * banks' own card photos), without a cardholder name, card number or network mark. Faldo accounts are
 * tracked by hand; these are not issued cards.
 */
/** A region of the logo file as [left, top, right, bottom] shares of its width and height. */
export type LogoFrame = readonly [number, number, number, number]

export interface ProviderLogo {
  src: string
  width: number
  height: number
  /** The visible artwork, trimming any empty margin in the file. */
  box?: LogoFrame
  /** Only the symbol, for round badges and GCash's large face mark. */
  symbol?: LogoFrame
  /** What to show in white on a dark card face, when the symbol has white detail that reversing would lose. */
  face?: LogoFrame
}

export interface CardArt {
  /** CSS background layers for the card face. */
  background: string
  ink: "light" | "dark"
  /** "white" shows the reversed (all-white) logo, as the real card does on a dark face. */
  logoTone?: "original" | "white"
  /** Show the logo's symbol large on the face, as GCash's card does. */
  bigMark?: boolean
  /** Shadow tint, when the brand colour doesn't match the face (Maya's card is black). */
  shadow?: string
}

export interface Provider {
  id: string
  name: string
  kinds: AccountType[]
  color: string
  logo?: ProviderLogo
  card?: CardArt
}

const face = (from: string, via: string, to: string) => `linear-gradient(140deg, ${from} 0%, ${via} 52%, ${to} 100%)`
const SHEEN = "linear-gradient(115deg, rgb(255 255 255 / 0.14), transparent 40%)"

/** Faces researched from each provider's current card. */
const CARDS: Record<string, CardArt> = {
  // Deep royal blue with the large glowing G symbol.
  gcash: { background: `radial-gradient(90% 120% at 85% 55%, rgb(120 160 255 / 0.35), transparent 60%), linear-gradient(155deg, #3a68ff 0%, #1445e3 40%, #0a279f 100%)`, ink: "light", logoTone: "white", bigMark: true },
  // Black with a fine halftone texture and the mint wordmark.
  maya: { background: `radial-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1.2px) 0 0 / 7px 7px, linear-gradient(160deg, #222524 0%, #0c0d0d 100%)`, ink: "light", logoTone: "original", shadow: "#101211" },
  // Bright blue.
  bdo: { background: `${SHEEN}, ${face("#2a78ec", "#0f55c9", "#0a3a98")}`, ink: "light", logoTone: "white" },
  // Deep red with layered translucent ribbons.
  bpi: { background: `linear-gradient(115deg, transparent 34%, rgb(255 255 255 / 0.07) 34% 56%, transparent 56%), linear-gradient(62deg, transparent 48%, rgb(0 0 0 / 0.14) 48% 70%, transparent 70%), linear-gradient(150deg, transparent 58%, rgb(255 255 255 / 0.05) 58% 80%, transparent 80%), ${face("#c8212a", "#a0151b", "#6f0c11")}`, ink: "light", logoTone: "white" },
  // Navy into aqua with fine horizontal lines.
  gotyme: { background: `repeating-linear-gradient(180deg, transparent 0 6px, rgb(6 26 40 / 0.32) 6px 8px), linear-gradient(172deg, #0b2233 0%, #0f4f63 42%, #2fc4bb 100%)`, ink: "light", logoTone: "white" },
  // Warm orange.
  unionbank: { background: `${SHEEN}, ${face("#ff9f2a", "#f57f17", "#dd5a0a")}`, ink: "light", logoTone: "white" },
  seabank: { background: `${SHEEN}, ${face("#ff8d33", "#f36c16", "#dc540b")}`, ink: "light", logoTone: "white" },
  maribank: { background: `${SHEEN}, ${face("#ff8a45", "#f26a2c", "#d9531a")}`, ink: "light", logoTone: "white" },
  landbank: { background: `${SHEEN}, ${face("#22a95a", "#128a44", "#0a5c2d")}`, ink: "light", logoTone: "white" },
  pnb: { background: `${SHEEN}, ${face("#2358be", "#0b3d91", "#062863")}`, ink: "light", logoTone: "white" },
  eastwest: { background: `${SHEEN}, ${face("#93309c", "#6d2077", "#43114b")}`, ink: "light", logoTone: "white" },
  cimb: { background: `${SHEEN}, ${face("#bd2350", "#8a1538", "#5a0c23")}`, ink: "light", logoTone: "white" },
}

const BANK: AccountType[] = ["bank", "savings", "credit_card"]

const logo = (id: string, width: number, height: number, frames: Omit<ProviderLogo, "src" | "width" | "height"> = {}): ProviderLogo =>
  ({ src: `/brand/providers/${id}.svg`, width, height, ...frames })

/** Official logo files (sources in public/brand/providers/SOURCES.md). Frames are measured from each file. */
const LOGOS: Record<string, ProviderLogo> = {
  gcash: logo("gcash", 651, 155, { box: [0.0025, 0.0105, 0.9983, 0.9895], symbol: [0.0025, 0.0105, 0.2792, 0.9895] }),
  maya: logo("maya", 148, 43, { box: [0.0058, 0.0057, 0.9983, 0.9885], symbol: [0.0058, 0.0057, 0.31, 0.9885] }),
  bdo: logo("bdo", 415, 145),
  bpi: logo("bpi", 194, 150, { box: [0.125, 0.2856, 0.8767, 0.7134], symbol: [0.125, 0.2856, 0.3483, 0.7134] }),
  gotyme: logo("gotyme", 564, 178, { box: [0, 0.0026, 1, 0.9974], symbol: [0, 0.0026, 0.4533, 0.9974] }),
  unionbank: logo("unionbank", 542, 166, { box: [0.1158, 0.1793, 0.8825, 0.7799], symbol: [0.1158, 0.1793, 0.2817, 0.7799] }),
  seabank: logo("seabank", 252, 81, { box: [0, 0, 1, 0.9922], symbol: [0, 0, 0.2942, 0.9922] }),
  landbank: logo("landbank", 213, 101, { symbol: [0.3517, 0, 0.6483, 0.6204], face: [0, 0.7557, 1, 1] }),
  pnb: logo("pnb", 609, 164, { box: [0.0033, 0, 0.9975, 0.9938], symbol: [0.0033, 0, 0.27, 0.9938], face: [0.3425, 0, 0.9975, 0.9938] }),
  eastwest: logo("eastwest", 379, 75, { symbol: [0, 0, 0.2142, 1] }),
  cimb: logo("cimb", 200, 31, { box: [0.015, 0.0914, 0.9917, 0.9624], symbol: [0.015, 0.0914, 0.1558, 0.9624], face: [0.1933, 0.0914, 0.9917, 0.9624] }),
}

const LIST: Provider[] = [
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

export const PROVIDERS: Provider[] = LIST.map((p) => ({ ...p, logo: LOGOS[p.id], card: CARDS[p.id] }))

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

/** The provider an account belongs to, matched on its institution (or name). */
export function providerFor(account: Pick<Account, "institution" | "name">): Provider | undefined {
  const keys = [account.institution, account.name].filter(Boolean).map((v) => normalize(v as string))
  return PROVIDERS.find((p) => keys.some((k) => k === normalize(p.name) || k.startsWith(normalize(p.name)) || k.startsWith(p.id)))
}

export function providersFor(kind: AccountType) {
  return PROVIDERS.filter((p) => p.kinds.includes(kind))
}
