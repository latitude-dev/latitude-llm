import type { Logger } from "./logger.ts"
import type { OtlpExportRequest } from "./types.ts"

export async function postTraces({
  baseUrl,
  apiKey,
  project,
  payload,
  logger,
  timeoutMs = 10_000,
}: {
  baseUrl: string
  apiKey: string
  project: string
  payload: OtlpExportRequest
  logger: Logger
  timeoutMs?: number
}): Promise<void> {
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/traces`
  const bodyText = JSON.stringify(payload)
  logger.debug(`POST ${url} (project=${project}, ${bodyText.length} bytes)`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
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
    } else {
      logger.debug(`ingest HTTP ${res.status}`)
    }
  } catch (err) {
    logger.warn(`ingest failed: ${String(err)}`)
  } finally {
    clearTimeout(timer)
  }
}
