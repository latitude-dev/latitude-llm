/**
 * Above this we skip the automatic thumbnail render and wait for an explicit click. This is a
 * memory guard, not a speed one — page-one cost tracks page complexity, but the decoded document
 * and its canvas backing stores track file size.
 */
const AUTO_PREVIEW_MAX_BYTES = 10 * 1024 * 1024

function normalizeMime(mimeType?: string | null): string {
  return (mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? ""
}

export function isPdfMime(mimeType?: string | null): boolean {
  return normalizeMime(mimeType) === "application/pdf"
}

export function shouldAutoRenderThumbnail(sizeBytes?: number): boolean {
  if (sizeBytes == null) return false
  return sizeBytes <= AUTO_PREVIEW_MAX_BYTES
}

/**
 * pdf.js has to fetch the bytes itself, so a cross-origin URL without CORS fails after we have
 * already paid for the lazy chunk and flashed a skeleton. Only same-origin, relative and blob
 * sources are worth attempting.
 */
export function isInlineRenderableUrl(url: string, origin?: string | undefined): boolean {
  if (url.startsWith("blob:") || url.startsWith("data:")) return true
  if (!origin) return false
  try {
    return new URL(url, origin).origin === origin
  } catch {
    return false
  }
}
