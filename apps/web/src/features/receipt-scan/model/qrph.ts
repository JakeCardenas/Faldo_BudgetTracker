/**
 * QR Ph, the Philippines' shared payment QR (the EMVCo format), shown at stores for GCash, Maya and bank apps. Reads
 * the store's name and city, the amount on codes that carry one and a reference, after checking the code's checksum.
 * Kept free of app imports so the tests can load it directly (tests/qrph.test.mjs).
 */
export interface QrPh {
  merchant: string | null
  city: string | null
  amountMinor: number | null
  reference: string | null
  /** The store's bank or wallet (who receives the money), when it's one we know. Not the wallet you pay with. */
  network: string | null
  /** A code made for one payment, usually with the amount in it; a store's printed code is static. */
  dynamic: boolean
}

// Receiving institutions by the first eight characters of their SWIFT code, as QR Ph codes carry them.
const NETWORKS: Record<string, string> = {
  GXCHPHM2: "GCash", PAPHPHM1: "Maya", BNORPHMM: "BDO", BOPIPHMM: "BPI", UBPHPHMM: "UnionBank", TLBPPHMM: "Landbank",
  MBTCPHMM: "Metrobank", SETCPHMM: "Security Bank", RCBCPHMM: "RCBC", PNBMPHMM: "PNB", CHBKPHMM: "China Bank",
}

/** Splits "ID(2) length(2) value" fields; null if the text isn't made of them. */
function fields(data: string): Map<string, string> | null {
  const out = new Map<string, string>()
  let at = 0
  while (at < data.length) {
    const id = data.slice(at, at + 2)
    const size = data.slice(at + 2, at + 4)
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(size)) return null
    const value = data.slice(at + 4, at + 4 + Number(size))
    if (value.length !== Number(size)) return null
    out.set(id, value)
    at += 4 + Number(size)
  }
  return out
}

/** CRC-16/CCITT-FALSE, the checksum QR Ph codes end with. */
function crc16(text: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

/** Names come in capitals ("JOLLIBEE KATIPUNAN"); show them the way people write them. */
function tidy(value: string | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  if (text !== text.toUpperCase()) return text
  return text.toLowerCase().replace(/(^|[\s\-/&.(])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())
}

function toMinor(value: string | undefined): number | null {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ""] = value.split(".")
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return minor > 0 ? minor : null
}

export function parseQrPh(payload: string): QrPh | null {
  const text = payload.trim()
  if (!text.startsWith("000201") || text.length < 12) return null
  const crcAt = text.length - 4
  if (text.slice(crcAt - 4, crcAt) !== "6304" || crc16(text.slice(0, crcAt)) !== text.slice(crcAt).toUpperCase()) return null
  const top = fields(text.slice(0, crcAt - 4))
  if (!top || top.get("53") !== "608") return null // pesos only

  let network: string | null = null
  for (let id = 26; id <= 51 && !network; id++) {
    const template = top.get(String(id))
    const bic = template ? fields(template)?.get("01") : undefined
    network = (bic && NETWORKS[bic.slice(0, 8)]) || null
  }
  const extra = top.get("62") ? fields(top.get("62") ?? "") : null
  return {
    merchant: tidy(top.get("59")),
    city: tidy(top.get("60")),
    amountMinor: toMinor(top.get("54")),
    reference: extra?.get("05") ?? extra?.get("01") ?? null,
    network,
    dynamic: top.get("01") === "12",
  }
}
