export class ApiError extends Error {
  status: number
  fieldErrors: { field: string; message: string }[]
  /** The problem's `type` (RFC 9457): which kind of error this is, like a stale edit. "about:blank" for ordinary ones. */
  type: string
  /** The whole problem body, for extension members such as `current` on a stale edit. */
  body: Record<string, unknown>

  constructor(status: number, message: string, fieldErrors: { field: string; message: string }[] = [],
    type = "about:blank", body: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
    this.type = type
    this.body = body
  }
}

const BASE = "/api/v1"

export type Query = Record<string, string | number | boolean | string[] | null | undefined>

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${BASE}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v))
      else url.searchParams.set(key, String(value))
    }
  }
  return `${url.pathname}${url.search}`
}

async function parseError(response: Response): Promise<ApiError> {
  let detail = "Something went wrong. Please try again."
  let errors: { field: string; message: string }[] = []
  let type = "about:blank"
  let problem: Record<string, unknown> = {}
  try {
    const body = await response.json()
    if (body && typeof body === "object") {
      problem = body
      if (typeof body.type === "string") type = body.type
    }
    if (body?.errors?.length) {
      errors = body.errors
      detail = body.errors.map((e: { message: string }) => e.message.replace(/^Value error, /, "")).join(" ")
    } else if (body?.detail) {
      detail = body.detail
    }
  } catch {
    if (response.status >= 500) detail = "The server is unavailable right now."
  }
  if (response.status === 401) signedOutElsewhere()
  return new ApiError(response.status, detail, errors, type, problem)
}

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"]
let onSignedOut: (() => void) | null = null

/** What to forget when a request finds the session gone (the query cache, set up in providers.tsx). */
export function whenSignedOut(handler: (() => void) | null) {
  onSignedOut = handler
}

/**
 * The server no longer accepts this tab's session (it expired, or was signed out from another device): forget the
 * last person's data first, then go to Log in. A 401 on the sign-in screens themselves is just a wrong password.
 */
function signedOutElsewhere() {
  const onPublicPage = typeof window !== "undefined" && PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p))
  if (onPublicPage) return
  onSignedOut?.()
  if (typeof window !== "undefined") window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
}

// Answers that mean "the request may never have been handled": worth sending again, but only when an Idempotency-Key
// makes sending it again safe.
const RETRYABLE = new Set([502, 503, 504])
const RETRY_DELAYS_MS = [400, 1200]

export async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Query; form?: FormData; signal?: AbortSignal; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-faldo-client": "web" }
  let body: BodyInit | undefined
  if (options.form) body = options.form
  else if (options.body !== undefined) {
    headers["content-type"] = "application/json"
    body = JSON.stringify(options.body)
  }
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey
  const send = () => fetch(buildUrl(path, options.query), { method, headers, body, credentials: "same-origin", signal: options.signal })
  let response: Response | undefined
  // With a key, a dropped connection or a gateway error is retried with the very same key, so the server records the
  // write at most once however many times it arrives. Without one, a write is never sent twice by this client.
  for (let attempt = 0; ; attempt++) {
    const last = !options.idempotencyKey || attempt >= RETRY_DELAYS_MS.length
    try {
      response = await send()
      if (last || !RETRYABLE.has(response.status)) break
    } catch (error) {
      if (last || (error instanceof DOMException && error.name === "AbortError")) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
  }
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** A file from the API (a data export or backup), with the name the server gave it. Errors come back as ApiError, so a
 *  "confirm it's you" answer can be handled like any other request. */
export async function download(path: string, query?: Query): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(buildUrl(path, query), { credentials: "same-origin", headers: { "x-faldo-client": "web" } })
  if (!response.ok) throw await parseError(response)
  const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "faldo-download.json"
  return { blob: await response.blob(), filename }
}

export const REAUTH_REQUIRED = "urn:faldo:problem:reauthentication-required"

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, { body, query }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, { form }),
  /** A write that must happen once: the same `idempotencyKey` on every retry of one submission (see useSubmissionKey). */
  postOnce: <T>(path: string, body: unknown, idempotencyKey: string) => request<T>("POST", path, { body, idempotencyKey }),
  uploadOnce: <T>(path: string, form: FormData, idempotencyKey: string) => request<T>("POST", path, { form, idempotencyKey }),
}

export interface StreamEvent {
  event: string
  data: Record<string, unknown>
}

export async function streamPost(path: string, body: unknown, onEvent: (event: StreamEvent) => void, signal?: AbortSignal) {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json", "x-faldo-client": "web", accept: "text/event-stream" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  })
  if (!response.ok || !response.body) throw await parseError(response)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary = buffer.indexOf("\n\n")
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const eventLine = chunk.split("\n").find((l) => l.startsWith("event: "))
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "))
      if (eventLine && dataLine) {
        onEvent({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) })
      }
      boundary = buffer.indexOf("\n\n")
    }
  }
}
