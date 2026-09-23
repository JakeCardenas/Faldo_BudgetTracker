"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowUp, Camera, ChevronLeft, FileImage, Loader2, MessageCircle, RotateCcw, ScanLine, X } from "lucide-react"
import { toast } from "sonner"
import { DraftCard } from "@/components/capture/draft-card"
import { TransactionForm, type TransactionFormValues } from "@/components/finance/transaction-form"
import { KeypadEntry, type EntryPreset, type EntryType } from "@/components/capture/keypad-entry"
import { Panda } from "@/components/brand/panda"
import { SHEET_CLASSES, SheetGrabber, useSheetDrag } from "@/components/ios/sheet"
import { Segmented } from "@/components/ios/segmented"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { api, ApiError } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { play } from "@/lib/sound"
import { invalidateFinancialData, useSaveTransaction } from "@/lib/queries"
import type { CaptureDraft, CaptureResult, Receipt, Transaction, TransactionInput } from "@/lib/types"
import { cn } from "@/lib/utils"

export type AddMode = EntryType | "describe" | "manual" | "receipt"

const EXAMPLES = ["Spent ₱350 at Jollibee", "Bought Nike shoes for ₱4,500 yesterday", "Salary ₱30,000", "Paid electricity ₱2,400 via GCash"]

function draftToForm(draft: CaptureDraft): Partial<TransactionFormValues> {
  return {
    type: draft.type, amount_minor: draft.amount_minor, occurred_on: draft.occurred_on, account_id: draft.account_id,
    to_account_id: draft.to_account_id, merchant: draft.merchant, category_id: draft.category_id,
    subcategory_id: draft.subcategory_id, payment_method: draft.payment_method, notes: draft.notes, items: draft.items, tags: draft.tags,
  }
}

function draftToInput(draft: CaptureDraft): TransactionInput {
  return {
    type: draft.type, amount_minor: draft.amount_minor ?? 0, occurred_on: draft.occurred_on, account_id: draft.account_id ?? "",
    to_account_id: draft.to_account_id, merchant: draft.merchant, category_id: draft.category_id, subcategory_id: draft.subcategory_id,
    payment_method: draft.payment_method, notes: draft.notes, tags: draft.tags,
    items: draft.items.map((i) => ({ name: i.name, quantity: i.quantity, amount_minor: i.amount_minor })),
  }
}

function DescribeTab({ onDone, initialText }: { onDone: () => void; initialText?: string }) {
  const qc = useQueryClient()
  const [text, setText] = useState(initialText ?? "")
  const [result, setResult] = useState<CaptureResult | null>(null)
  const [drafts, setDrafts] = useState<CaptureDraft[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function parse(value = text) {
    if (!value.trim()) return
    setBusy(true)
    try {
      const data = await api.post<CaptureResult>("/capture/parse", { text: value })
      setResult(data)
      setDrafts(data.drafts)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't read that.")
    } finally {
      setBusy(false)
    }
  }

  async function save(list: CaptureDraft[]) {
    setBusy(true)
    try {
      const created = await api.post<Transaction[]>("/capture/confirm", { transactions: list.map(draftToInput) })
      await invalidateFinancialData(qc)
      const total = created.reduce((sum, t) => sum + t.amount_minor, 0)
      showLoggedToast(created, created.length > 1 ? `Logged ${created.length} transactions worth ${formatMoney(total)}.` : `Logged ${formatMoney(total)}.`,
        () => void invalidateFinancialData(qc))
      onDone()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }

  const started = useRef(false)
  useEffect(() => {
    if (started.current || !initialText?.trim()) return
    started.current = true
    void parse(initialText)
    // Read what was typed in the + menu once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText])

  if (editing !== null) {
    const draft = drafts[editing]
    return (
      <TransactionForm
        initial={draftToForm(draft)}
        highlights={Object.fromEntries(draft.issues.map((i) => [i.field, i.message]))}
        submitLabel="Save transaction"
        busy={busy}
        onCancel={() => setEditing(null)}
        onSubmit={async (input) => {
          setBusy(true)
          try {
            await api.post("/capture/confirm", { transactions: [input] })
            const remaining = drafts.filter((_, i) => i !== editing)
            await invalidateFinancialData(qc)
            toast.success("Transaction saved")
            if (remaining.length) { setDrafts(remaining); setEditing(null) } else onDone()
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
          } finally {
            setBusy(false)
          }
        }}
      />
    )
  }

  const blocking = drafts.some((d) => d.issues.some((i) => i.blocking) || !d.amount_minor || !d.account_id)
  const unresolved = drafts.reduce((n, d) => n + d.issues.length, 0)

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); parse() }} className="relative">
        <label htmlFor="capture-text" className="sr-only">Describe a transaction</label>
        <textarea
          id="capture-text"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); parse() } }}
          rows={2}
          maxLength={500}
          autoFocus
          placeholder="e.g. Grab ₱180 and Starbucks ₱210 via GCash"
          className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3.5 pr-14 text-[0.9375rem] leading-relaxed outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus:border-ring focus:ring-3 focus:ring-ring/25"
        />
        <Button type="submit" size="icon" className="absolute right-3 bottom-3.5" disabled={busy || !text.trim()} aria-label="Read transaction">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>

      {!result && (
        <div className="space-y-2">
          <p className="text-[0.8125rem] text-muted-foreground">Write it the way you'd text a friend. English or Taglish works.</p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => { setText(example); parse(example) }}
                className="pressable rounded-lg border bg-card px-3 py-1.5 text-[0.8125rem] text-muted-foreground hover:bg-accent/60 hover:text-foreground">
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && !result.is_financial && (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          I couldn't find an amount in that. Try something like “Lunch ₱250 at Mang Inasal”.
        </p>
      )}

      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{unresolved ? "Check the highlighted details before saving" : "Everything looks clear"}</span>
            <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setResult(null); setDrafts([]); setText(""); inputRef.current?.focus() }}>
              <RotateCcw className="size-3" /> Start over
            </button>
          </div>
          {drafts.map((draft, index) => (
            <DraftCard key={index} draft={draft} onEdit={() => setEditing(index)}
              onChange={(next) => setDrafts(drafts.map((d, i) => (i === index ? next : d)))} />
          ))}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              {result?.parser === "rules" ? "Read by Faldo's on-device parser" : "Read by AI"}. Nothing is saved until you confirm.
            </p>
            <Button onClick={() => save(drafts)} disabled={busy || blocking}>
              {busy ? "Saving…" : drafts.length > 1 ? `Save ${drafts.length}` : unresolved ? "Confirm & save" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** What the scan found, in one line: "Read a GCash transfer: ₱500 in from Juan. Check it before saving." */
function readSummary(extraction: Receipt["extraction"]) {
  if (!extraction) return "Couldn't read this one. Fill in the details below."
  const what = extraction.document_label ?? "a receipt"
  const money = extraction.amount_minor ? formatMoney(extraction.amount_minor) : null
  const flow = extraction.type === "income" ? "in" : extraction.type === "transfer" ? "moved" : "spent"
  const who = extraction.merchant ? (extraction.type === "income" ? ` from ${extraction.merchant}` : ` at ${extraction.merchant}`) : ""
  return `Read ${what}${money ? `: ${money} ${flow}${who}` : ""}. Check it before saving.`
}

function ReceiptTab({ onDone, initialReceipt }: { onDone: () => void; initialReceipt?: Receipt | null }) {
  const qc = useQueryClient()
  const [receipt, setReceipt] = useState<Receipt | null>(initialReceipt ?? null)
  const [preview, setPreview] = useState<string | null>(initialReceipt?.has_image ? `/api/v1/receipts/${initialReceipt.id}/image` : null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!receipt || receipt.status !== "processing") return
    const timer = setInterval(async () => {
      const next = await api.get<Receipt>(`/receipts/${receipt.id}`).catch(() => null)
      if (next && next.status !== "processing") setReceipt(next)
    }, 1500)
    return () => clearInterval(timer)
  }, [receipt])

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview) }, [preview])

  async function upload(file: File) {
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    try {
      setReceipt(await api.upload<Receipt>("/receipts", form))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed.")
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  if (!receipt) {
    return (
      <div className="space-y-3">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f) }}
          className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 px-6 py-12 text-center transition-colors hover:border-ring hover:bg-muted/50">
          {uploading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <FileImage className="size-6 text-muted-foreground" strokeWidth={2} />}
          <span className="text-sm font-medium">{uploading ? "Uploading securely…" : "Drop a receipt photo or browse"}</span>
          <span className="text-xs text-muted-foreground">JPEG, PNG or WebP up to 8 MB. Location data is removed.</span>
        </button>
        <Button variant="outline" className="w-full sm:hidden" onClick={() => cameraRef.current?.click()}><Camera /> Take a photo</Button>
      </div>
    )
  }

  const extraction = receipt.extraction
  const issues = Object.fromEntries(receipt.issues.map((i) => [i.field, i.message]))
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,14rem)_1fr]">
      <div className="space-y-2">
        {preview && <img src={preview} alt="Receipt preview" className="max-h-80 w-full rounded-lg border bg-muted object-contain" />}
        <p className="text-xs text-muted-foreground">
          {receipt.status === "processing" && "Reading the amount, who it's from, the date and the items…"}
          {receipt.status === "needs_review" && readSummary(extraction)}
          {receipt.status === "unavailable" && receipt.error}
          {receipt.status === "failed" && receipt.error}
        </p>
        {(receipt.status === "failed" || receipt.status === "unavailable") && receipt.has_image && (
          <Button variant="secondary" size="sm" className="w-full" disabled={retrying} onClick={async () => {
            setRetrying(true)
            try {
              setReceipt(await api.post<Receipt>(`/receipts/${receipt.id}/retry`))
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : "Couldn't read it again.")
            } finally {
              setRetrying(false)
            }
          }}>
            {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />} Read it again
          </Button>
        )}
      </div>
      {receipt.status === "processing" ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-muted/30 p-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Scanning receipt
        </div>
      ) : (
        <TransactionForm
          initial={extraction ? {
            type: extraction.type ?? "expense", amount_minor: extraction.amount_minor, occurred_on: extraction.occurred_on,
            merchant: extraction.merchant, category_id: extraction.category_id, subcategory_id: extraction.subcategory_id ?? null,
            account_id: extraction.account_id ?? undefined, payment_method: extraction.payment_method, notes: extraction.notes ?? null,
            items: extraction.type === "expense" || !extraction.type ? extraction.items : [],
          } : undefined}
          highlights={issues}
          busy={saving}
          submitLabel="Save from receipt"
          onCancel={async () => {
            await api.delete(`/receipts/${receipt.id}`).catch(() => undefined)
            void qc.invalidateQueries({ queryKey: ["receipts"] })
            setReceipt(null)
            setPreview(null)
          }}
          onSubmit={async (input) => {
            setSaving(true)
            try {
              await api.post(`/receipts/${receipt.id}/confirm`, input)
              await invalidateFinancialData(qc)
              void qc.invalidateQueries({ queryKey: ["receipts"] })
              toast.success("Receipt saved as a transaction")
              onDone()
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
            } finally {
              setSaving(false)
            }
          }}
        />
      )}
    </div>
  )
}

export function showLoggedToast(transactions: Transaction[], message: string, onUndone?: () => void) {
  play("success")
  toast.custom((id) => (
    <div className="flex w-[min(24rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border bg-popover p-2.5 pr-2 text-popover-foreground shadow-(--shadow-float)">
      <Panda pose="happy" sizes="56px" className="w-12 shrink-0" />
      <p className="min-w-0 flex-1 text-sm leading-snug">{message}</p>
      <button type="button" onClick={async () => {
        play("undo")
        toast.dismiss(id)
        try {
          await Promise.all(transactions.map((t) => api.delete(`/transactions/${t.id}`)))
          onUndone?.()
          toast.success(transactions.length > 1 ? "Transactions removed" : "Transaction removed")
        } catch {
          toast.error("Couldn't undo that.")
        }
      }} className="pressable hit h-8 shrink-0 rounded-md px-3 text-[0.8125rem] font-medium text-primary hover:bg-accent">Undo</button>
    </div>
  ), { duration: 6000 })
}

export function AddTransactionDialog({ open, onOpenChange, mode, onModeChange, receipt, preset, text }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: AddMode
  onModeChange: (mode: AddMode) => void
  receipt?: Receipt | null
  preset?: EntryPreset
  text?: string
}) {
  const qc = useQueryClient()
  const save = useSaveTransaction()
  const [manualInitial, setManualInitial] = useState<Partial<TransactionInput> | null>(null)
  const [lastEntry, setLastEntry] = useState<EntryType>("expense")
  const close = () => onOpenChange(false)
  const { ref, handle } = useSheetDrag(() => { play("close"); setManualInitial(null); onOpenChange(false) })
  const keypad = mode === "expense" || mode === "income" || mode === "transfer"
  const entryType: EntryType = keypad ? (mode as EntryType) : lastEntry

  const saved = (transaction: Transaction, feedback: string) => {
    close()
    showLoggedToast([transaction], feedback, () => void invalidateFinancialData(qc))
  }

  const title = mode === "describe" ? "Type it out" : mode === "receipt" ? "Scan a receipt" : mode === "manual" ? "All details" : "New transaction"

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { play("close"); setManualInitial(null) } onOpenChange(next) }}>
      <DialogContent ref={ref} showCloseButton={false} aria-describedby={undefined}
        onOpenAutoFocus={(e) => { if (keypad) { e.preventDefault(); (e.currentTarget as HTMLElement).focus() } }}
        className={cn("flex flex-col gap-0 overflow-hidden bg-popover p-0 max-sm:h-[94dvh]", SHEET_CLASSES,
          keypad ? "sm:h-[min(52rem,94dvh)] sm:max-w-[27rem]" : "sm:max-h-[92dvh] sm:max-w-2xl")}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div {...handle}>
        <SheetGrabber />
        <div className="flex items-center gap-2 px-3 pb-2 sm:px-4 sm:pt-4">
          {keypad ? (
            <button type="button" onClick={() => { play("close"); close() }} aria-label="Close" className="pressable hit flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="size-5" strokeWidth={2} />
            </button>
          ) : (
            <button type="button" onClick={() => onModeChange(entryType)} className="pressable hit flex h-9 shrink-0 items-center gap-0.5 rounded-lg pr-2.5 pl-1 text-sm font-medium text-primary hover:bg-accent">
              <ChevronLeft className="size-5" /> Back
            </button>
          )}
          <div className="flex min-w-0 flex-1 justify-center">
            {keypad ? (
              <Segmented label="Transaction type" value={mode as EntryType} onChange={(v) => { setLastEntry(v); onModeChange(v) }}
                options={[{ value: "expense", label: "Expense", tone: "expense" }, { value: "income", label: "Income", tone: "income" }, { value: "transfer", label: "Transfer" }]} size="sm" />
            ) : <p className="truncate text-[0.9375rem] font-semibold">{title}</p>}
          </div>
          {keypad ? (
            <div className="flex shrink-0 gap-1.5">
              <button type="button" onClick={() => { play("tap"); setLastEntry(entryType); onModeChange("describe") }} aria-label="Type it out"
                className="pressable hit flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><MessageCircle className="size-[1.15rem]" strokeWidth={2} /></button>
              <button type="button" onClick={() => { play("tap"); setLastEntry(entryType); onModeChange("receipt") }} aria-label="Scan receipt"
                className="pressable hit flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><ScanLine className="size-[1.15rem]" strokeWidth={2} /></button>
            </div>
          ) : <span className="w-[4.5rem]" />}
        </div>
        </div>
        <DialogDescription className="sr-only">Log an expense, income or transfer.</DialogDescription>
        {keypad ? (
          <KeypadEntry key={mode} type={mode as EntryType} preset={preset} onSaved={saved}
            onMoreDetails={(values) => { setLastEntry(values.type); setManualInitial(values); onModeChange("manual") }} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6">
            {mode === "describe" && <DescribeTab key={text ?? ""} onDone={close} initialText={text} />}
            {mode === "receipt" && <ReceiptTab key={receipt?.id ?? "new"} onDone={close} initialReceipt={receipt} />}
            {mode === "manual" && (
              <TransactionForm initial={manualInitial ? {
                type: manualInitial.type, amount_minor: manualInitial.amount_minor ?? null, occurred_on: manualInitial.occurred_on,
                account_id: manualInitial.account_id ?? null, to_account_id: manualInitial.to_account_id ?? null,
                category_id: manualInitial.category_id ?? null, subcategory_id: manualInitial.subcategory_id ?? null, notes: manualInitial.notes ?? null,
              } : undefined} busy={save.isPending} onCancel={() => onModeChange(entryType)} onSubmit={(input) => save.mutate({ data: input }, {
                onSuccess: (transaction) => saved(transaction, `Saved ${formatMoney(transaction.amount_minor, transaction.currency)} with all the details.`),
                onError: (error) => toast.error(error.message),
              })} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
