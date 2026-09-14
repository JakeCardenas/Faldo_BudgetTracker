"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowUp, BookText, Check, ChevronDown, CircleAlert, Loader2, MessageSquarePlus, PanelLeft, ShieldCheck, Sparkles, Square, Trash2, Wrench,
} from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { BlockView } from "@/components/assistant/blocks"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { api, streamPost } from "@/lib/api"
import { formatDate, timeAgo } from "@/lib/format"
import type { Block, ChatMessage, Source, ToolCallRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Step { id: string; tool: string; label: string; state: "running" | "done" | "error" }
interface LiveMessage extends ChatMessage { steps?: Step[]; streaming?: boolean; error?: string }

const SUGGESTIONS = [
  { group: "Understand", items: ["Where did my money go this month?", "Have I been spending more than last month?", "How much have I spent on shoes this year?"] },
  { group: "Decide", items: ["Can I afford a ₱3,000 purchase?", "When can I afford my MacBook?", "What happens if I spend ₱5,000 this weekend?"] },
  { group: "Improve", items: ["Why am I running out of money?", "What should I reduce this month?", "What subscriptions do I have?"] },
]

const TOOL_NAMES: Record<string, string> = {
  get_current_balance: "Account balances", get_monthly_income: "Monthly income", get_monthly_expenses: "Monthly expenses",
  get_category_spending: "Category spending", get_transactions: "Transactions", compare_spending: "Period comparison",
  get_savings_summary: "Savings summary", get_budget_status: "Budget status", get_goal_progress: "Goal progress",
  get_upcoming_payments: "Upcoming payments", get_recurring_payments: "Recurring payments", calculate_affordability: "Affordability calculation",
  calculate_forecast: "Balance forecast", simulate_scenario: "What-if simulation", search_financial_memory: "Financial memory search (RAG)",
  sum_transactions: "Exact total", calculate: "Calculator", get_financial_health: "Health score", get_debts: "Money owed", get_insights: "Insights",
}

function RichText({ text, sources, onOpenTransaction }: { text: string; sources: Source[]; onOpenTransaction: (id: string) => void }) {
  const parts = text.split(/(\[[tmi]\d{1,3}\])/g)
  return (
    <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap text-foreground">
      {parts.map((part, i) => {
        const match = part.match(/^\[([tmi]\d{1,3})\]$/)
        if (!match) return <span key={i}>{part}</span>
        const source = sources.find((s) => s.ref === match[1])
        const txnId = source?.type === "transaction" ? source.id : source?.type === "transaction_item" ? (source as Source & { transaction_id?: string }).transaction_id : undefined
        return (
          <button key={i} type="button" onClick={() => txnId && onOpenTransaction(txnId)} disabled={!txnId}
            title={source ? `${source.label}${source.date ? ` · ${source.date}` : ""}` : undefined}
            className="mx-0.5 inline-flex -translate-y-px items-center rounded-md border bg-secondary px-1.5 align-middle font-mono text-[0.68rem] text-primary transition hover:border-primary/30 disabled:cursor-default">
            {match[1]}
          </button>
        )
      })}
    </p>
  )
}

function Details({ message, onOpenTransaction }: { message: LiveMessage; onOpenTransaction: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const tools: ToolCallRecord[] = message.tool_calls ?? []
  const sources = message.sources ?? []
  if (!tools.length && !sources.length) return null
  return (
    <div className="rounded-xl border bg-surface">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground" aria-expanded={open}>
        <Wrench className="size-3.5" />
        <span className="flex-1 text-left">How Faldo answered · {tools.length} tool{tools.length === 1 ? "" : "s"}{sources.length > 0 && ` · ${sources.length} source${sources.length === 1 ? "" : "s"}`}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <ol className="space-y-1">
            {tools.map((t, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                {t.ok ? <Check className="size-3 text-primary" /> : <CircleAlert className="size-3 text-destructive" />}
                <span className="font-medium">{TOOL_NAMES[t.name] ?? t.name}</span>
                <code className="truncate text-muted-foreground">{t.name}({Object.entries(t.arguments).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})</code>
                <span className="ml-auto tabular text-muted-foreground">{t.duration_ms}ms</span>
              </li>
            ))}
          </ol>
          {sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">Sources & context</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {sources.map((s) => {
                  const txnId = s.type === "transaction" ? s.id : s.type === "transaction_item" ? (s as Source & { transaction_id?: string }).transaction_id : undefined
                  return (
                    <li key={s.ref}>
                      <button type="button" disabled={!txnId} onClick={() => txnId && onOpenTransaction(txnId)}
                        className="flex w-full items-start gap-2 rounded-lg border bg-card p-2 text-left text-xs transition enabled:hover:border-primary/30">
                        <span className="rounded bg-muted px-1 font-mono text-[0.62rem] text-muted-foreground">{s.ref}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{s.label}</span>
                          <span className="block truncate text-muted-foreground">{s.type.replace(/_/g, " ")}{s.date && ` · ${formatDate(s.date, "MMM d, yyyy")}`}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <ShieldCheck className="size-3" />
            {message.validation === "passed" && "Every figure in this answer was checked against tool results."}
            {message.validation === "repaired" && "The answer was rewritten after an unsupported figure was detected."}
            {message.validation === "fallback" && "The written explanation couldn't be verified, so only calculated results are shown."}
            {message.validation === "unavailable" && "The AI service was unavailable."}
          </p>
        </div>
      )}
    </div>
  )
}

function AssistantMessage({ message, onFollowUp, onOpenTransaction }: { message: LiveMessage; onFollowUp: (q: string) => void; onOpenTransaction: (id: string) => void }) {
  const runningStep = message.steps?.find((s) => s.state === "running")
  return (
    <div className="flex gap-3">
      <LogoMark className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        {message.steps && message.steps.length > 0 && message.streaming && !message.content && (
          <ul className="space-y-1.5" aria-live="polite">
            {message.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                {step.state === "running" ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <Check className="size-3.5 text-primary" />}
                {step.label}
              </li>
            ))}
          </ul>
        )}
        {message.streaming && !message.content && !runningStep && !message.steps?.length && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Thinking about your data…</p>
        )}
        {message.error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-destructive">{message.error}</p>}
        {message.content && <RichText text={message.content} sources={message.sources ?? []} onOpenTransaction={onOpenTransaction} />}
        {message.blocks?.length > 0 && (
          <div className={cn("grid items-start gap-3", message.blocks.length > 1 && "xl:grid-cols-2")}>
            {message.blocks.map((block: Block, i: number) => (
              <div key={i} className={cn("animate-rise min-w-0", (block.type === "forecast" || block.type === "transactions" || block.type === "bars") && message.blocks.length > 1 && "xl:col-span-2")}>
                <BlockView block={block} onOpenTransaction={onOpenTransaction} />
              </div>
            ))}
          </div>
        )}
        {!message.streaming && <Details message={message} onOpenTransaction={onOpenTransaction} />}
        {!message.streaming && message.follow_ups?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.follow_ups.map((q) => (
              <button key={q} type="button" onClick={() => onFollowUp(q)} className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-foreground">{q}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Conversations({ activeId, onSelect, onNew }: { activeId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const qc = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => api.get<{ id: string; title: string; updated_at: string }[]>("/assistant/conversations") })
  return (
    <div className="flex h-full flex-col gap-3">
      <Button variant="outline" onClick={onNew} className="justify-start bg-card"><MessageSquarePlus /> New conversation</Button>
      <ul className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
        {data.length === 0 && <li className="px-2 py-4 text-xs text-muted-foreground">Your conversations appear here.</li>}
        {data.map((c) => (
          <li key={c.id} className="group relative">
            <button type="button" onClick={() => onSelect(c.id)}
              className={cn("w-full rounded-lg px-2.5 py-2 pr-8 text-left text-sm transition-colors hover:bg-muted", activeId === c.id && "bg-accent text-accent-foreground")}>
              <span className="block truncate">{c.title}</span>
              <span className="block text-xs text-muted-foreground">{timeAgo(c.updated_at)}</span>
            </button>
            <button type="button" aria-label="Delete conversation" onClick={async () => { await api.delete(`/assistant/conversations/${c.id}`); qc.invalidateQueries({ queryKey: ["conversations"] }); if (activeId === c.id) onNew() }}
              className="absolute top-2.5 right-1.5 rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AssistantView() {
  const params = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const { openTransaction } = useAppActions()
  const [messages, setMessages] = useState<LiveMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [devProvider, setDevProvider] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initialAsked = useRef(false)

  useEffect(() => {
    api.get<{ is_development: boolean }>("/assistant/status").then((s) => setDevProvider(s.is_development)).catch(() => undefined)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  const ask = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setInput("")
    setBusy(true)
    const now = new Date().toISOString()
    const assistantId = `live-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: text, blocks: [], sources: [], follow_ups: [], tool_calls: [], provider: null, validation: null, created_at: now },
      { id: assistantId, role: "assistant", content: "", blocks: [], sources: [], follow_ups: [], tool_calls: [], provider: null, validation: null, created_at: now, steps: [], streaming: true },
    ])
    const patch = (fn: (m: LiveMessage) => LiveMessage) => setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)))
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamPost("/assistant/messages", { message: text, conversation_id: conversationId }, ({ event, data }) => {
        if (event === "conversation") { setConversationId(String(data.id)); setDevProvider(Boolean(data.is_development_provider)) }
        if (event === "status") {
          const step = data as unknown as Step
          patch((m) => {
            const steps = [...(m.steps ?? [])]
            const idx = steps.findIndex((s) => s.id === step.id && s.tool === step.tool && s.state === "running")
            if (idx >= 0) steps[idx] = step
            else steps.push(step)
            return { ...m, steps }
          })
        }
        if (event === "blocks") patch((m) => ({ ...m, blocks: (data.blocks as Block[]) ?? [] }))
        if (event === "delta") patch((m) => ({ ...m, content: m.content + String(data.text) }))
        if (event === "done") patch((m) => ({
          ...m, streaming: false, id: String(data.message_id), sources: data.sources as Source[], follow_ups: data.follow_ups as string[],
          tool_calls: data.tool_calls as ToolCallRecord[], validation: String(data.validation), provider: String(data.provider),
        }))
        if (event === "error") patch((m) => ({ ...m, streaming: false, error: String(data.message) }))
      }, controller.signal)
    } catch (error) {
      if ((error as Error).name !== "AbortError") patch((m) => ({ ...m, streaming: false, error: (error as Error).message || "Couldn't reach the assistant." }))
      else patch((m) => ({ ...m, streaming: false, content: m.content || "Stopped." }))
    } finally {
      setBusy(false)
      abortRef.current = null
      qc.invalidateQueries({ queryKey: ["conversations"] })
      textareaRef.current?.focus()
    }
  }, [busy, conversationId, qc])

  useEffect(() => {
    const q = params.get("q")
    if (q && !initialAsked.current) {
      initialAsked.current = true
      router.replace("/assistant")
      ask(q)
    }
  }, [params, ask, router])

  async function loadConversation(id: string) {
    setHistoryOpen(false)
    const data = await api.get<{ id: string; messages: ChatMessage[] }>(`/assistant/conversations/${id}`)
    setConversationId(id)
    setMessages(data.messages)
  }

  function newConversation() {
    abortRef.current?.abort()
    setConversationId(null)
    setMessages([])
    setHistoryOpen(false)
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4.5rem-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-4rem)]">
      <aside className="hidden w-64 shrink-0 border-r px-4 py-4 xl:block">
        <Conversations activeId={conversationId} onSelect={loadConversation} onNew={newConversation} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2.5 sm:px-6">
          <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setHistoryOpen(true)} aria-label="Conversations"><PanelLeft /></Button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Faldo Assistant</h1>
            <p className="truncate text-xs text-muted-foreground">Answers come from your records and Faldo's calculations, never guesses.</p>
          </div>
          {devProvider && <span className="hidden rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-[0.7rem] font-medium text-warning sm:inline">Development AI provider</span>}
          {messages.length > 0 && <Button variant="ghost" size="sm" onClick={newConversation}><MessageSquarePlus /> <span className="hidden sm:inline">New</span></Button>}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-8 py-6">
            {messages.length === 0 ? (
              <div className="animate-rise space-y-8 pt-4 sm:pt-10">
                <div className="space-y-3 text-center">
                  <div className="relative mx-auto w-fit">
                    <div className="absolute inset-0 scale-150 rounded-full bg-mint blur-2xl" aria-hidden />
                    <LogoMark className="relative size-12" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">Ask about your money</h2>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">Faldo looks up your transactions, budgets, goals and bills, calculates exact figures, and explains what they mean.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {SUGGESTIONS.map((group) => (
                    <div key={group.group} className="space-y-2">
                      <p className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.group}</p>
                      {group.items.map((q) => (
                        <button key={q} type="button" onClick={() => ask(q)} className="block w-full rounded-xl border bg-card px-3.5 py-3 text-left text-sm shadow-(--shadow-card) transition hover:-translate-y-0.5 hover:border-primary/25">
                          {q}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><BookText className="size-3.5" /> Faldo is not a licensed financial advisor. For investments, loans or insurance, talk to a professional.</p>
              </div>
            ) : (
              messages.map((m) => m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.95rem] text-primary-foreground">{m.content}</p>
                </div>
              ) : (
                <AssistantMessage key={m.id} message={m} onFollowUp={ask} onOpenTransaction={openTransaction} />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
          <form onSubmit={(e) => { e.preventDefault(); ask(input) }} className="relative mx-auto max-w-3xl">
            <label htmlFor="assistant-input" className="sr-only">Ask Faldo</label>
            <textarea
              id="assistant-input"
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input) } }}
              rows={1}
              maxLength={1000}
              placeholder="Ask anything about your finances…"
              className="max-h-40 min-h-12 w-full resize-none rounded-2xl border border-input bg-card py-3 pr-14 pl-4 text-[0.95rem] shadow-(--shadow-card) outline-none field-sizing-content placeholder:text-muted-foreground/70 focus:border-ring focus:ring-3 focus:ring-ring/25"
            />
            {busy ? (
              <Button type="button" size="icon" variant="secondary" className="absolute right-2 bottom-2 rounded-xl" onClick={() => abortRef.current?.abort()} aria-label="Stop"><Square className="size-3.5" /></Button>
            ) : (
              <Button type="submit" size="icon" className="absolute right-2 bottom-2 rounded-xl" disabled={!input.trim()} aria-label="Send"><ArrowUp /></Button>
            )}
          </form>
        </div>
      </div>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-80 p-4">
          <SheetHeader className="p-0"><SheetTitle>Conversations</SheetTitle></SheetHeader>
          <Conversations activeId={conversationId} onSelect={loadConversation} onNew={newConversation} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default function AssistantPage() {
  return <Suspense><AssistantView /></Suspense>
}
