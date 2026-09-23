"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { NotebookPen, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { EmptyState } from "@/components/finance/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { timeAgo } from "@/lib/format"
import { useNotes } from "@/lib/queries"

export function QuickNotes() {
  const qc = useQueryClient()
  const { data: notes = [], isLoading } = useNotes()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await api.post("/notes", { content: text.trim() })
      setText("")
      await qc.invalidateQueries({ queryKey: ["notes"] })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save note.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); add() }} className="card-surface space-y-3 p-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3}
          placeholder="Upcoming expenses, reminders, a shopping list… Faldo can also use these notes when you ask questions."
          className="w-full resize-none rounded-xl bg-muted/60 p-3 text-base outline-none focus:ring-2 focus:ring-ring/30 sm:text-sm" />
        <button type="submit" disabled={busy || !text.trim()} className="pressable flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          <Plus className="size-4" /> Save note
        </button>
      </form>
      {isLoading ? <Skeleton className="h-40 rounded-xl" /> : notes.length === 0 ? (
        <div className="card-surface"><EmptyState icon={NotebookPen} title="No notes yet" description="Jot down things you don't want to forget, like bills to pay or items to buy." /></div>
      ) : (
        <ul className="ios-group divide-y divide-border/60">
          {notes.map((note) => (
            <li key={note.id} className="group flex items-start gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{note.content}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(note.created_at)}</p>
              </div>
              <button type="button" aria-label="Delete note" onClick={async () => { await api.delete(`/notes/${note.id}`); void qc.invalidateQueries({ queryKey: ["notes"] }) }}
                className="pressable hit flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
