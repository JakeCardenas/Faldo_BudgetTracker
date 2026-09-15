export const OPERATORS = ["+", "−", "×", "÷"] as const
type Operator = (typeof OPERATORS)[number]

const isOperator = (c: string): c is Operator => (OPERATORS as readonly string[]).includes(c)

function lastSegment(expr: string) {
  let i = expr.length - 1
  while (i >= 0 && !isOperator(expr[i])) i--
  return expr.slice(i + 1)
}

export function pressKey(expr: string, key: string): string {
  if (key === "AC") return ""
  if (key === "⌫") return expr.slice(0, -1)
  const last = expr.at(-1) ?? ""
  if (isOperator(key)) {
    if (!expr) return key === "−" ? "" : expr
    if (isOperator(last)) return expr.slice(0, -1) + key
    if (last === ".") return expr.slice(0, -1) + key
    return expr + key
  }
  if (expr.length >= 24) return expr
  const segment = lastSegment(expr)
  if (key === "%") return !segment || segment.endsWith("%") || segment.endsWith(".") ? expr : expr + "%"
  if (segment.endsWith("%")) return expr
  if (key === ".") {
    if (segment.includes(".")) return expr
    return expr + (segment ? "." : "0.")
  }
  if (!/^\d{1,2}$/.test(key)) return expr
  const [whole, decimals] = segment.split(".")
  if (decimals !== undefined && decimals.length + key.length > 2) return expr
  if (decimals === undefined && whole.length + key.length > 9) return expr
  if (segment === "0") return expr.slice(0, -1) + (key === "00" ? "0" : key)
  if (!segment && key === "00") return expr + "0"
  return expr + key
}

export function hasOperation(expr: string) {
  return /[+−×÷%]/.test(expr.replace(/[+−×÷]$/, ""))
}

export function evaluate(expr: string): number | null {
  const trimmed = expr.replace(/[+−×÷.]+$/, "")
  if (!trimmed) return null
  const terms: { value: number; percent: boolean }[] = []
  const ops: Operator[] = []
  let current = ""
  for (const char of trimmed) {
    if (isOperator(char)) {
      if (!current) return null
      terms.push({ value: Number(current.replace("%", "")), percent: current.endsWith("%") })
      ops.push(char)
      current = ""
    } else current += char
  }
  if (!current) return null
  terms.push({ value: Number(current.replace("%", "")), percent: current.endsWith("%") })
  if (terms.some((t) => Number.isNaN(t.value))) return null

  const values: { value: number; percent: boolean }[] = [terms[0]]
  const additive: Operator[] = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const term = terms[i + 1]
    if (op === "×" || op === "÷") {
      const left = values[values.length - 1]
      const leftValue = left.percent ? left.value / 100 : left.value
      const rightValue = term.percent ? term.value / 100 : term.value
      if (op === "÷" && rightValue === 0) return null
      values[values.length - 1] = { value: op === "×" ? leftValue * rightValue : leftValue / rightValue, percent: false }
    } else {
      additive.push(op)
      values.push(term)
    }
  }
  let total = values[0].percent ? values[0].value / 100 : values[0].value
  for (let i = 0; i < additive.length; i++) {
    const term = values[i + 1]
    const amount = term.percent ? (total * term.value) / 100 : term.value
    total = additive[i] === "+" ? total + amount : total - amount
  }
  return Math.round(total * 100) / 100
}

export function formatExpression(expr: string) {
  return expr.replace(/\d+(\.\d*)?/g, (match) => {
    const [whole, decimals] = match.split(".")
    const grouped = Number(whole).toLocaleString("en-PH")
    return decimals !== undefined ? `${grouped}.${decimals}` : grouped
  })
}
