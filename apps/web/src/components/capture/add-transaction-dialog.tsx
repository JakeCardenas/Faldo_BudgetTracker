"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowUp, Camera, FileImage, Keyboard, Loader2, MessageSquareText, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { DraftCard } from "@/components/capture/draft-card"
import { TransactionForm, type TransactionFormValues } from "@/components/finance/transaction-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, ApiError } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { invalidateFinancialData, useSaveTransaction } from "@/lib/queries"
import type { CaptureDraft, CaptureResult, Receipt, TransactionInput } from "@/lib/types"

export type AddMode = "describe" | "manual" | "receipt"

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

function DescribeTab({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState("")
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
      await api.post("/capture/confirm", { transactions: list.map(draftToInput) })
      await invalidateFinancialData(qc)
      toast.success(list.length > 1 ? `${list.length} transactions saved` : "Transaction saved")
      onDone()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }

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
          className="w-full resize-none rounded-2xl border border-input bg-card px-4 py-3.5 pr-14 text-[0.95rem] shadow-(--shadow-card) outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-3 focus:ring-ring/25"
        />
        <Button type="submit" size="icon" className="absolute right-3 bottom-3.5 rounded-xl" disabled={busy || !text.trim()} aria-label="Read transaction">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>

      {!result && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Write it the way you'd text a friend. English or Taglish works.</p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => { setText(example); parse(example) }}
                className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && !result.is_financial && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
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
              {result?.parser === "rules" ? "Read by Faldo's on-device parser" : "Read by AI"} · nothing is saved until you confirm
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

function ReceiptTab({ onDone, initialReceipt }: { onDone: () => void; initialReceipt?: Receipt | null }) {
  const qc = useQueryClient()
  const [receipt, setReceipt] = useState<Receipt | null>(initialReceipt ?? null)
  const [preview, setPreview] = useState<string | null>(initialReceipt?.has_image ? `/api/v1/receipts/${initialReceipt.id}/image` : null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
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
          className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-muted/40 px-6 py-10 text-center transition-colors hover:border-primary/30 hover:bg-accent/50">
          {uploading ? <Loader2 className="size-6 animate-spin text-primary" /> : <FileImage className="size-6 text-primary" />}
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
    <div className="grid gap-5 md:grid-cols-[minmax(0,14rem)_1fr]">
      <div className="space-y-2">
        {preview && <img src={preview} alt="Receipt preview" className="max-h-80 w-full rounded-xl border object-contain bg-muted" />}
        <p className="text-xs text-muted-foreground">
          {receipt.status === "processing" && "Reading merchant, date, items and total…"}
          {receipt.status === "needs_review" && `Extracted${extraction?.amount_minor ? ` · total ${formatMoney(extraction.amount_minor)}` : ""}. Review before saving.`}
          {receipt.status === "unavailable" && receipt.error}
          {receipt.status === "failed" && receipt.error}
        </p>
      </div>
      {receipt.status === "processing" ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-muted/30 p-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Scanning receipt
        </div>
      ) : (
        <TransactionForm
          initial={extraction ? {
            type: "expense", amount_minor: extraction.amount_minor, occurred_on: extraction.occurred_on, merchant: extraction.merchant,
            category_id: extraction.category_id, payment_method: extraction.payment_method, items: extraction.items,
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

export function AddTransactionDialog({ open, onOpenChange, mode, onModeChange, receipt }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: AddMode
  onModeChange: (mode: AddMode) => void
  receipt?: Receipt | null
}) {
  const save = useSaveTransaction()
  const close = () => onOpenChange(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl">
        <DialogHeader className="border-b px-5 pt-5 pb-4 text-left">
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>Describe it, enter it, or scan a receipt. You'll confirm before anything is saved.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as AddMode)} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="px-5 pt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="describe"><MessageSquareText /> Describe</TabsTrigger>
              <TabsTrigger value="manual"><Keyboard /> Manual</TabsTrigger>
              <TabsTrigger value="receipt"><Camera /> Receipt</TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
            <TabsContent value="describe"><DescribeTab onDone={close} /></TabsContent>
            <TabsContent value="manual">
              <TransactionForm busy={save.isPending} onCancel={close} onSubmit={(input) => save.mutate({ data: input }, {
                onSuccess: () => { toast.success("Transaction saved"); close() },
                onError: (error) => toast.error(error.message),
              })} />
            </TabsContent>
            <TabsContent value="receipt"><ReceiptTab key={receipt?.id ?? "new"} onDone={close} initialReceipt={receipt} /></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
