// Bun --preload shim for Claude Code (a Bun-compiled standalone). Wraps globalThis.fetch
// and, whenever the process POSTs to Anthropic's /v1/messages endpoint, writes the full
// request body (system prompt, messages, tools, model, etc.) to disk keyed by the
// response's message id. The matching Stop hook reads these files and enriches its
// llm_request spans with the exact payload the model received.
//
// This runs inside the claude process. It has zero dependencies, uses only node
// built-ins, and is fail-silent: any error falls through to the original fetch.

import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const REQUESTS_DIR = join(homedir(), ".claude", "state", "latitude", "requests")
const MESSAGES_PATH_RE = /\/v1\/messages(\?|$|\/)/
const DEBUG = process.env.LATITUDE_DEBUG === "1"

try {
  mkdirSync(REQUESTS_DIR, { recursive: true })
} catch {
  // best-effort
}

const originalFetch: typeof fetch | undefined = globalThis.fetch
if (typeof originalFetch === "function") {
  globalThis.fetch = interceptedFetch as typeof fetch
}

async function interceptedFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  if (!originalFetch) return fetch(input, init)

  const url = getUrl(input)
  if (!url || !shouldCapture(url)) {
    return originalFetch(input, init)
  }

  let bodyText: string | undefined
  try {
    bodyText = await extractBody(input, init)
  } catch {
    bodyText = undefined
  }

  const response = await originalFetch(input, init)

  if (!bodyText || !response.ok || !response.body) return response

  try {
    // Tee the response stream: one side goes to the caller (the Anthropic SDK), the
    // other side we scan for the message_start SSE event. As soon as that event
    // arrives, we know the message id and write the request file synchronously —
    // well before the Stop hook can fire, eliminating the race we'd have if we
    // waited for the full response to drain.
    const [forCaller, forScan] = response.body.tee()
    void scanForMessageIdAndWrite(forScan, bodyText, url)

    return new Response(forCaller, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (err) {
    if (DEBUG) process.stderr.write(`[latitude-intercept] tee failed: ${String(err)}\n`)
    return response
  }
}

async function scanForMessageIdAndWrite(
  stream: ReadableStream<Uint8Array>,
  bodyText: string,
  url: string,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  let wrote = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) buffered += decoder.decode(value, { stream: true })
      if (!wrote) {
        const messageId = extractMessageId(buffered)
        if (messageId) {
          writeRequest(messageId, bodyText, url)
          wrote = true
          // Drain the rest silently so the underlying source isn't back-pressured.
          // We don't need any more bytes; just keep pulling until done.
        }
      }
    }
    if (!wrote && DEBUG) {
      process.stderr.write("[latitude-intercept] stream ended without message_start\n")
    }
  } catch (err) {
    if (DEBUG) process.stderr.write(`[latitude-intercept] scan failed: ${String(err)}\n`)
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // already released
    }
  }
}

function shouldCapture(url: string): boolean {
  if (!MESSAGES_PATH_RE.test(url)) return false
  // Match any Anthropic-style endpoint, including ANTHROPIC_BASE_URL overrides to
  // localhost proxies. We key off the path; the host check is permissive.
  return true
}

function getUrl(input: Parameters<typeof fetch>[0]): string | undefined {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  if (input && typeof input === "object" && "url" in input && typeof input.url === "string") return input.url
  return undefined
}

async function extractBody(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] | undefined,
): Promise<string | undefined> {
  const body = init?.body
  if (typeof body === "string") return body
  if (body instanceof Uint8Array) return new TextDecoder().decode(body)
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body))
  if (input && typeof input === "object" && !(input instanceof URL) && "clone" in input) {
    try {
      return await (input as Request).clone().text()
    } catch {
      return undefined
    }
  }
  return undefined
}

function extractMessageId(sseText: string): string | undefined {
  // Anthropic SSE events are separated by a blank line. Find the message_start
  // event and parse its JSON `data:` payload.
  const events = sseText.split("\n\n")
  for (const event of events) {
    if (!event.includes("message_start")) continue
    const lines = event.split("\n")
    const dataLine = lines.find((l) => l.startsWith("data:"))
    if (!dataLine) continue
    const json = dataLine.slice("data:".length).trim()
    try {
      const parsed = JSON.parse(json) as { message?: { id?: string } }
      if (parsed?.message?.id) return parsed.message.id
    } catch {
      // not valid JSON, keep scanning
    }
  }
  return undefined
}

function writeRequest(messageId: string, bodyText: string, url: string): void {
  const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, "_")
  const filename = join(REQUESTS_DIR, `${safeId}.json`)
  try {
    const payload = {
      messageId,
      capturedAt: new Date().toISOString(),
      url,
      request: safeParse(bodyText),
    }
    writeFileSync(filename, JSON.stringify(payload), "utf-8")
    if (DEBUG) process.stderr.write(`[latitude-intercept] wrote ${filename}\n`)
  } catch (err) {
    if (DEBUG) process.stderr.write(`[latitude-intercept] write failed: ${String(err)}\n`)
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}
