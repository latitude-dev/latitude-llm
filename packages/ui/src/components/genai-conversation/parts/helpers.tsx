import { isJsonBlock } from "@repo/utils"
import { AudioContent, ImageContent, VideoContent } from "./media-content.tsx"

export function getKnownField<T>(metadata: Record<string, unknown> | undefined, field: string): T | undefined {
  const known = (metadata?._known_fields ?? metadata?._knownFields) as Record<string, unknown> | undefined
  return known?.[field] as T | undefined
}

export function formatJson(value: unknown): string {
  if (value === undefined || value === null) return ""

  if (typeof value === "string") {
    if (isJsonBlock(value)) {
      try {
        return JSON.stringify(JSON.parse(value), null, 2)
      } catch {
        return value
      }
    }
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function renderMediaByModality({
  modality,
  src,
  mimeType,
  href,
}: {
  modality: string
  src: string
  mimeType: string | undefined
  /** Original openable URL (uri parts). When set, media renders an "open in new tab" affordance. */
  href?: string | undefined
}) {
  if (modality === "image") {
    return <ImageContent src={src} mimeType={mimeType} href={href} />
  }

  if (modality === "audio") {
    return <AudioContent src={src} mimeType={mimeType} href={href} />
  }

  if (modality === "video") {
    return <VideoContent src={src} mimeType={mimeType} href={href} />
  }

  return null
}
