"use client"

import { useState } from "react"
import { ArrowDownUp } from "lucide-react"
import { Disclaimer, Field, inputClass } from "@/components/tools/shared"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const REFERENCE: Record<string, { name: string; flag: string; php: number }> = {
  USD: { name: "US dollar", flag: "🇺🇸", php: 57 },
  EUR: { name: "Euro", flag: "🇪🇺", php: 63 },
  JPY: { name: "Japanese yen", flag: "🇯🇵", php: 0.38 },
  SGD: { name: "Singapore dollar", flag: "🇸🇬", php: 43 },
  HKD: { name: "Hong Kong dollar", flag: "🇭🇰", php: 7.3 },
  KRW: { name: "Korean won", flag: "🇰🇷", php: 0.041 },
  AUD: { name: "Australian dollar", flag: "🇦🇺", php: 37 },
  CAD: { name: "Canadian dollar", flag: "🇨🇦", php: 41 },
  GBP: { name: "British pound", flag: "🇬🇧", php: 75 },
  AED: { name: "UAE dirham", flag: "🇦🇪", php: 15.5 },
  SAR: { name: "Saudi riyal", flag: "🇸🇦", php: 15.2 },
  CNY: { name: "Chinese yuan", flag: "🇨🇳", php: 7.9 },
}

export function CurrencyConverter() {
  const [code, setCode] = useState("USD")
  const [rate, setRate] = useState(String(REFERENCE.USD.php))
  const [amount, setAmount] = useState("100")
  const [toPhp, setToPhp] = useState(true)
  const r = Number(rate) || 0
  const a = Number(amount.replace(/,/g, "")) || 0
  const result = toPhp ? a * r : r > 0 ? a / r : 0
  const fmt = (value: number, currency: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: currency === "JPY" || currency === "KRW" ? 0 : 2 }).format(value)

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="card-surface space-y-4 p-5">
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Currency">
            <Select value={code} onValueChange={(v) => { setCode(v); setRate(String(REFERENCE[v].php)) }}>
              <SelectTrigger className="h-12! w-full rounded-lg bg-card text-base font-semibold"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(REFERENCE).map(([k, v]) => <SelectItem key={k} value={k}>{v.flag} {k} · {v.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={`1 ${code} = ₱`}>
            <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={`${inputClass} w-28`} aria-label="Exchange rate" />
          </Field>
        </div>
        <Field label={toPhp ? `Amount in ${code}` : "Amount in PHP"}>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" className={inputClass} />
        </Field>
        <button type="button" onClick={() => setToPhp(!toPhp)} className="pressable mx-auto flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Swap direction">
          <ArrowDownUp className="size-5" />
        </button>
        <div className="rounded-lg bg-muted/60 p-4 text-center">
          <p className="text-[0.8125rem] text-muted-foreground">{toPhp ? "In Philippine pesos" : `In ${code}`}</p>
          <p className="tabular mt-1 text-3xl font-semibold tracking-[-0.025em]">{fmt(result, toPhp ? "PHP" : code)}</p>
        </div>
      </section>
      <Disclaimer>Rates are editable references, not live quotes. Enter the rate your bank or remittance service shows today.</Disclaimer>
    </div>
  )
}
