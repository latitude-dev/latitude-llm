import type { Logger } from "./logger.ts"
import type { OtlpExportRequest } from "./types.ts"

interface TransportOptions {
  baseUrl: string
  apiKey: string
  project: string
  logger: Logger
  timeoutMs?: number
  maxAttempts?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 500
const RETRY_AFTER_MAX_MS = 30_000

/**
 * Ships OTLP requests sequentially with bounded retries. Every span is sent
 * exactly once on success: Latitude's trace and session rollups add per
 * insert, so a duplicate would inflate counts; a `4xx` other than `429` is
 * therefore final, while `429`, `5xx` and network errors retry with backoff.
 */
export class Transport {
  private readonly url: string
  private readonly opts: TransportOptions
  private chain: Promise<void> = Promise.resolve()
  private pending = 0

  constructor(opts: TransportOptions) {
    this.opts = opts
    this.url = `${withoutTrailingSlashes(opts.baseUrl)}/v1/traces`
  }

  enqueue(payload: OtlpExportRequest): void {
    this.pending++
    this.chain = this.chain
      .then(() => this.send(payload))
      .catch((err) => this.opts.logger.warn(`export failed: ${String(err)}`))
      .finally(() => {
        this.pending--
      })
  }

  /** Resolves when everything queued so far has been sent or given up on, or the budget elapses. */
  async flush(budgetMs: number): Promise<void> {
    if (this.pending === 0) return
    await Promise.race([this.chain, sleep(budgetMs)])
  }

  private async send(payload: OtlpExportRequest): Promise<void> {
    const body = JSON.stringify(payload)
    const spanCount = payload.resourceSpans.reduce(
      (n, rs) => n + rs.scopeSpans.reduce((m, ss) => m + ss.spans.length, 0),
      0,
    )
    const maxAttempts = this.opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    const doFetch = this.opts.fetchImpl ?? fetch
    const wait = this.opts.sleep ?? sleep

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      try {
        const res = await doFetch(this.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.opts.apiKey}`,
            "X-Latitude-Project": this.opts.project,
          },
          body,
          signal: controller.signal,
        })
        if (res.ok) {
          this.opts.logger.debug(`exported ${spanCount} spans (${body.length} bytes) HTTP ${res.status}`)
          return
        }
        const text = await res.text().catch(() => "")
        const retryable = res.status === 429 || res.status >= 500
        if (!retryable || attempt === maxAttempts) {
          this.opts.logger.warn(`ingest HTTP ${res.status} (final): ${text.slice(0, 300)}`)
          return
        }
        const retryAfter = Number(res.headers.get("retry-after"))
        const honoured =
          Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, RETRY_AFTER_MAX_MS) : 0
        await wait(honoured || backoff(attempt))
      } catch (err) {
        if (attempt === maxAttempts) {
          this.opts.logger.warn(`ingest unreachable after ${attempt} attempts: ${String(err)}`)
          return
        }
        await wait(backoff(attempt))
      } finally {
        clearTimeout(timer)
      }
    }
  }
}

function backoff(attempt: number): number {
  return RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * RETRY_BASE_MS
}

function withoutTrailingSlashes(url: string): string {
  let end = url.length
  while (end > 0 && url[end - 1] === "/") end--
  return url.slice(0, end)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}
