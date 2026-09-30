/** What a list should show. A failed first load is an error, never an empty list. */
export function listView(q: { isLoading: boolean; isError: boolean; hasData: boolean; count: number }) {
  if (q.isLoading) return "loading"
  if (q.isError && !q.hasData) return "error"
  return q.count === 0 ? "empty" : "items"
}

/** What a detail view should show. A failed load is an error, never an endless skeleton. */
export function detailView(q: { isError: boolean; hasData: boolean }) {
  if (q.hasData) return "ready"
  return q.isError ? "error" : "loading"
}
