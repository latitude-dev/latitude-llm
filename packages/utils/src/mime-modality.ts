/** Infers GenAI content modality from a MIME type (image/video/audio, else document). */
export function inferModalityFromMime(mimeType: string): "image" | "video" | "audio" | "document" {
  const top = mimeType.toLowerCase().split(";")[0]?.trim().split("/")[0]
  if (top === "image") return "image"
  if (top === "video") return "video"
  if (top === "audio") return "audio"
  return "document"
}

/** When mime is set, trust it; otherwise keep the producer modality. */
export function resolveContentModality(modality: string, mimeType?: string | null): string {
  if (mimeType) return inferModalityFromMime(mimeType)
  return modality
}
