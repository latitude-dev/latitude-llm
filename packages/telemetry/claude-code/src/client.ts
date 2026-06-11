import type { Logger } from "./logger.ts"
import type { OtlpExportRequest } from "./types.ts"

// Resolves true only on a 2xx response. Callers must not record the payload as
// delivered on false — the transcript offset only advances after every chunk of a
// batch lands, so failed exports are retried on the next Stop (span IDs are
// deterministic, so re-sends dedupe server-side).
export async function postTraces({
  baseUrl,
  apiKey,
  project,
  payload,
  logger,
  timeoutMs = 30_000,
}: {
  baseUrl: string
  apiKey: string
  project: string
  payload: OtlpExportRequest
  logger: Logger
  timeoutMs?: number
}): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/traces`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const bodyText = JSON.stringify(payload)
    logger.debug(`POST ${url} (project=${project}, ${bodyText.length} bytes)`)
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Latitude-Project": project,
      },
      body: bodyText,
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      logger.warn(`ingest HTTP ${res.status}: ${text.slice(0, 500)}`)
      return false
    }
    logger.debug(`ingest HTTP ${res.status}`)
    return true
  } catch (err) {
    logger.warn(`ingest failed: ${String(err)}`)
    return false
  } finally {
    clearTimeout(timer)
  }
}
