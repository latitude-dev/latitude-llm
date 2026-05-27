import { isJsonBlock } from "@repo/utils"
import { FileIcon } from "lucide-react"
import { Text } from "../../text/text.tsx"
import { ImageContent } from "./media-content.tsx"

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
    return (
      <audio controls className="max-w-md">
        <source src={src} type={mimeType} />
        <track kind="captions" />
      </audio>
    )
  }

  if (modality === "video") {
    return (
      <video controls className="max-w-md max-h-64 rounded-lg">
        <source src={src} type={mimeType} />
        <track kind="captions" />
      </video>
    )
  }

  return null
}

export function MediaFallback({
  modality,
  mimeType,
}: {
  readonly modality: string
  readonly mimeType?: string | null | undefined
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
      <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />
      <Text.H6 color="foregroundMuted">
        {modality} &middot; {mimeType ?? "binary data"}
      </Text.H6>
    </span>
  )
}
