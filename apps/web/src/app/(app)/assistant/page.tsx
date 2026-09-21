"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowUp, BookText, Check, ChevronDown, ChevronLeft, CircleAlert, History, Loader2, Mic, MicOff, PenSquare, ShieldCheck, Square, Trash2, Wrench,
} from "lucide-react"
import { toast } from "sonner"
import { LogoMark } from "@/components/brand/logo"
import { Panda } from "@/components/brand/panda"
import { BlockView } from "@/components/assistant/blocks"
import { LoggedCard, ReviewCard, draftToInput, looksLikeLogging } from "@/components/assistant/logged-card"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { api, streamPost } from "@/lib/api"
import { formatDate, timeAgo } from "@/lib/format"
import { invalidateFinancialData, useMe } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Block, CaptureDraft, CaptureResult, ChatMessage, Source, ToolCallRecord, Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Step { id: string; tool: string; label: string; state: "running" | "done" | "error" }
interface LiveMessage extends ChatMessage { steps?: Step[]; streaming?: boolean; error?: string; logged?: Transaction[]; drafts?: CaptureDraft[] }

const SUGGESTIONS = [
  { group: "Log it", items: ["Spent 250 on lunch", "Grab 180 and coffee 140 from GCash", "Salary 30k"] },
  { group: "Understand", items: ["Where did my money go this month?", "Have I been spending more than last month?", "What subscriptions do I have?"] },
  { group: "Decide", items: ["Can I afford a ₱3,000 purchase?", "When can I afford my MacBook?", "What should I reduce this month?"] },
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
    <p className="text-[0.9375rem] leading-[1.65] whitespace-pre-wrap text-foreground">
      {parts.map((part, i) => {
        const match = part.match(/^\[([tmi]\d{1,3})\]$/)
        if (!match) return <span key={i}>{part}</span>
        const source = sources.find((s) => s.ref === match[1])
        const txnId = source?.type === "transaction" ? source.id : source?.type === "transaction_item" ? (source as Source & { transaction_id?: string }).transaction_id : undefined
        return (
          <button key={i} type="button" onClick={() => txnId && onOpenTransaction(txnId)} disabled={!txnId}
            title={source ? `${source.label}${source.date ? `, ${source.date}` : ""}` : undefined}
            className="mx-0.5 inline-flex -translate-y-px items-center rounded border bg-muted px-1 align-middle font-mono text-[0.6875rem] text-muted-foreground transition-colors enabled:hover:border-input enabled:hover:text-foreground disabled:cursor-default">
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
    <div className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground" aria-expanded={open}>
        <Wrench className="size-3.5" />
        <span className="flex-1 text-left">How Faldo answered: {tools.length} tool{tools.length === 1 ? "" : "s"}{sources.length > 0 && `, ${sources.length} source${sources.length === 1 ? "" : "s"}`}</span>
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
              <p className="text-xs font-medium text-muted-foreground">Sources and context</p>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {sources.map((s) => {
                  const txnId = s.type === "transaction" ? s.id : s.type === "transaction_item" ? (s as Source & { transaction_id?: string }).transaction_id : undefined
                  return (
                    <li key={s.ref}>
                      <button type="button" disabled={!txnId} onClick={() => txnId && onOpenTransaction(txnId)}
                        className="flex w-full items-start gap-2 rounded-md border bg-card p-2 text-left text-xs transition-colors enabled:hover:bg-accent/60">
                        <span className="rounded bg-muted px-1 font-mono text-[0.625rem] text-muted-foreground">{s.ref}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{s.label}</span>
                          <span className="block truncate text-muted-foreground">{s.type.replace(/_/g, " ")}{s.date && `, ${formatDate(s.date, "MMM d, yyyy")}`}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <p className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
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

function AssistantMessage({ message, onFollowUp, onOpenTransaction, onDraftsLogged }: {
  message: LiveMessage
  onFollowUp: (q: string) => void
  onOpenTransaction: (id: string) => void
  onDraftsLogged: (transactions: Transaction[]) => void
}) {
  const runningStep = message.steps?.find((s) => s.state === "running")
  return (
    <div className="flex gap-3">
      <LogoMark className="size-8 drop-shadow-none" />
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        {message.logged && <LoggedCard transactions={message.logged} onOpen={onOpenTransaction} />}
        {message.drafts && <ReviewCard drafts={message.drafts} onLogged={onDraftsLogged} />}
        {message.steps && message.steps.length > 0 && message.streaming && !message.content && (
          <ul className="space-y-1.5 py-0.5" aria-live="polite">
            {message.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                {step.state === "running" ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : <Check className="size-3.5 text-primary" />}
                {step.label}
              </li>
            ))}
          </ul>
        )}
        {message.streaming && !message.content && !runningStep && !message.steps?.length && (
          <p className="flex h-6 w-fit items-center gap-1" aria-label="Thinking">
            {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 160}ms` }} />)}
          </p>
        )}
        {message.error && <p className="rounded-lg border border-destructive/20 bg-danger-soft px-4 py-3 text-sm text-destructive">{message.error}</p>}
        {message.content && (
          <div>
            <RichText text={message.content} sources={message.sources ?? []} onOpenTransaction={onOpenTransaction} />
          </div>
        )}
        {message.blocks?.length > 0 && (
          <div className={cn("grid items-start gap-3", message.blocks.length > 1 && "xl:grid-cols-2")}>
            {message.blocks.map((block: Block, i: number) => (
              <div key={i} className={cn("animate-rise min-w-0", (block.type === "forecast" || block.type === "transactions" || block.type === "bars") && message.blocks.length > 1 && "xl:col-span-2")}>
                <BlockView block={block} onOpenTransaction={onOpenTransaction} />
              </div>
            ))}
          </div>
        )}
        {!message.streaming && !message.logged && !message.drafts && <Details message={message} onOpenTransaction={onOpenTransaction} />}
        {!message.streaming && message.follow_ups?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.follow_ups.map((q) => (
              <button key={q} type="button" onClick={() => onFollowUp(q)} className="pressable rounded-lg border bg-card px-3 py-1.5 text-[0.8125rem] text-foreground/85 hover:bg-accent/60">{q}</button>
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
      <Button variant="outline" onClick={onNew} className="justify-start"><PenSquare className="text-muted-foreground" /> New chat</Button>
      <ul className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
        {data.length === 0 && <li className="px-2 py-4 text-xs text-muted-foreground">Your conversations appear here.</li>}
        {data.map((c) => (
          <li key={c.id} className="group relative">
            <button type="button" onClick={() => onSelect(c.id)}
              className={cn("w-full rounded-lg px-2.5 py-2 pr-8 text-left text-sm transition-colors hover:bg-accent", activeId === c.id && "bg-accent font-medium")}>
              <span className="block truncate">{c.title}</span>
              <span className="block text-xs font-normal text-muted-foreground">{timeAgo(c.updated_at)}</span>
            </button>
            <button type="button" aria-label="Delete conversation" onClick={async () => { await api.delete(`/assistant/conversations/${c.id}`); qc.invalidateQueries({ queryKey: ["conversations"] }); if (activeId === c.id) onNew() }}
              className="absolute top-2.5 right-1.5 rounded p-1 text-muted-foreground transition hover:text-destructive focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

type SpeechRecognitionLike = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; interimResults: boolean; lang: string; continuous: boolean }

function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition)
  })
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  function toggle() {
    if (listening) { recognition.current?.stop(); return }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    const r = new Ctor()
    r.lang = "en-PH"
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => onText(Array.from(e.results).map((res) => res[0].transcript).join(" "))
    r.onend = () => setListening(false)
    recognition.current = r
    setListening(true)
    try { r.start() } catch { setListening(false) }
  }
  return { listening, supported, toggle }
}

function AssistantView() {
  const params = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
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
  const dictation = useDictation((text) => setInput((current) => (current ? `${current} ${text}` : text)))

  useEffect(() => {
    api.get<{ is_development: boolean }>("/assistant/status").then((s) => setDevProvider(s.is_development)).catch(() => undefined)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  const tryLog = useCallback(async (text: string): Promise<boolean> => {
    if (!looksLikeLogging(text)) return false
    let result: CaptureResult
    try {
      result = await api.post<CaptureResult>("/capture/parse", { text })
    } catch {
      return false
    }
    if (!result.is_financial || !result.drafts.length || result.drafts.some((d) => !d.amount_minor)) return false
    const now = new Date().toISOString()
    const base = { blocks: [], sources: [], follow_ups: [], tool_calls: [], provider: null, validation: null, created_at: now }
    const needsReview = result.drafts.some((d) => d.issues.some((i) => i.blocking) || !d.account_id)
    if (needsReview) {
      setMessages((prev) => [...prev, { ...base, id: `u-${Date.now()}`, role: "user", content: text }, { ...base, id: `r-${Date.now()}`, role: "assistant", content: "", drafts: result.drafts }])
      return true
    }
    try {
      const created = await api.post<Transaction[]>("/capture/confirm", { transactions: result.drafts.map(draftToInput) })
      await invalidateFinancialData(qc)
      play("success")
      setMessages((prev) => [...prev, { ...base, id: `u-${Date.now()}`, role: "user", content: text }, { ...base, id: `l-${Date.now()}`, role: "assistant", content: "", logged: created }])
      return true
    } catch (error) {
      toast.error((error as Error).message || "Couldn't log that.")
      return true
    }
  }, [qc])

  const ask = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    play("send")
    setInput("")
    setBusy(true)
    if (await tryLog(text)) {
      setBusy(false)
      textareaRef.current?.focus()
      return
    }
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
  }, [busy, conversationId, qc, tryLog])

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
    <div className="flex h-dvh">
      <aside className="hidden w-64 shrink-0 border-r px-3 py-4 xl:block">
        <Conversations activeId={conversationId} onSelect={loadConversation} onNew={newConversation} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="glass z-10 flex items-center gap-2 border-b border-border/70 px-3 pt-safe sm:px-6">
          <div className="flex h-14 w-full items-center gap-2">
            <Link href="/" aria-label="Back to home" className="pressable -ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-accent lg:hidden">
              <ChevronLeft className="size-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="text-[0.9375rem] font-semibold">Chat with Faldo</h1>
              <p className="truncate text-xs text-muted-foreground">Ask questions or log money in plain language</p>
            </div>
            {devProvider && <span className="hidden rounded-md bg-warning-soft px-2 py-1 text-[0.6875rem] font-medium text-warning sm:inline">Dev AI</span>}
            <button type="button" onClick={() => setHistoryOpen(true)} aria-label="Conversations" className="pressable flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground xl:hidden"><History className="size-[1.1rem]" strokeWidth={1.85} /></button>
            <button type="button" onClick={newConversation} aria-label="New chat" className="pressable flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><PenSquare className="size-[1.1rem]" strokeWidth={1.85} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-6 py-6">
            {messages.length === 0 ? (
              <div className="animate-rise space-y-6">
                <div className="flex flex-col items-center pt-4 text-center sm:pt-10">
                  <Panda pose="wave" priority sizes="112px" className="w-24" />
                  <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em]">Hi {me?.display_name?.split(" ")[0] ?? "there"}, how can I help?</h2>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">Ask about your balances, spending or goals. You can also log money the way you&apos;d text it, like &ldquo;Spent 250 on food&rdquo;.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {SUGGESTIONS.map((group) => (
                    <div key={group.group} className="space-y-2">
                      <p className="px-1 text-[0.8125rem] font-medium text-muted-foreground">{group.group}</p>
                      {group.items.map((q) => (
                        <button key={q} type="button" onClick={() => ask(q)} className="pressable block w-full rounded-lg border bg-card px-3.5 py-2.5 text-left text-sm hover:bg-accent/60">
                          {q}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <p className="flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground"><BookText className="mt-px size-3.5 shrink-0" /> Faldo is not a licensed financial advisor. For investments, loans or insurance, talk to a professional.</p>
              </div>
            ) : (
              messages.map((m) => m.role === "user" ? (
                <div key={m.id} className="flex justify-end pl-10">
                  <p className="rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground">{m.content}</p>
                </div>
              ) : (
                <AssistantMessage key={m.id} message={m} onFollowUp={ask} onOpenTransaction={openTransaction}
                  onDraftsLogged={(logged) => setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, drafts: undefined, logged } : x)))} />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
          <form onSubmit={(e) => { e.preventDefault(); ask(input) }} className="mx-auto max-w-3xl rounded-xl border bg-card p-2 shadow-(--shadow-float) transition-[border-color] focus-within:border-input">
            <label htmlFor="assistant-input" className="sr-only">Ask Faldo or log a transaction</label>
            <textarea
              id="assistant-input"
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input) } }}
              rows={1}
              maxLength={1000}
              placeholder="Ask a question or type an expense"
              className="max-h-40 min-h-11 w-full resize-none bg-transparent px-2.5 py-2 text-base outline-none field-sizing-content placeholder:text-muted-foreground/80 sm:text-[0.9375rem]"
            />
            <div className="flex items-center justify-end gap-2">
              {dictation.supported && (
                <button type="button" onClick={dictation.toggle} aria-label={dictation.listening ? "Stop dictation" : "Dictate"} aria-pressed={dictation.listening}
                  className={cn("pressable flex size-9 items-center justify-center rounded-lg", dictation.listening ? "animate-pulse bg-expense-soft text-expense" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                  {dictation.listening ? <MicOff className="size-4.5" /> : <Mic className="size-4.5" />}
                </button>
              )}
              {busy ? (
                <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop"><Square className="size-3.5" /></Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send"><ArrowUp /></Button>
              )}
            </div>
          </form>
        </div>
      </div>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-80 bg-popover p-4">
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
