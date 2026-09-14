export class ApiError extends Error {
  status: number
  fieldErrors: { field: string; message: string }[]

  constructor(status: number, message: string, fieldErrors: { field: string; message: string }[] = []) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
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
  try {
    const body = await response.json()
    if (body?.errors?.length) {
      errors = body.errors
      detail = body.errors.map((e: { message: string }) => e.message.replace(/^Value error, /, "")).join(" ")
    } else if (body?.detail) {
      detail = body.detail
    }
  } catch {
    if (response.status >= 500) detail = "The server is unavailable right now."
  }
  const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password"]
  if (response.status === 401 && typeof window !== "undefined" && !publicPaths.some((p) => window.location.pathname.startsWith(p))) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
  }
  return new ApiError(response.status, detail, errors)
}

export async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Query; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-faldo-client": "web" }
  let body: BodyInit | undefined
  if (options.form) body = options.form
  else if (options.body !== undefined) {
    headers["content-type"] = "application/json"
    body = JSON.stringify(options.body)
  }
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: options.signal,
  })
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, { body, query }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, { form }),
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
