import { ExternalLinkIcon, ImageOffIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "../../../utils/cn.ts"
import { Text } from "../../text/text.tsx"

type MediaStatus = "loading" | "loaded" | "error"

// Shared footprint for the loading skeleton and the error placeholder so the
// layout doesn't jump before the real image dimensions are known.
const PLACEHOLDER_BOX = "h-40 w-64 max-w-md rounded-lg"

/** Hover-revealed (keyboard-focusable) action pinned to the top-right of a loaded image. */
function OpenOriginalButton({ href }: { readonly href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open image in new tab"
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/media:opacity-100"
    >
      <ExternalLinkIcon className="h-3.5 w-3.5" />
    </a>
  )
}

/** Shown when the image source can't be loaded (missing, expired, blocked, or corrupt). */
function ImageErrorPlaceholder({
  mimeType,
  href,
}: {
  readonly mimeType?: string | undefined
  readonly href?: string | undefined
}) {
  return (
    <div
      className={cn(
        PLACEHOLDER_BOX,
        "flex flex-col items-center justify-center gap-1.5 border border-dashed border-border bg-muted/30 p-4 text-center",
      )}
    >
      <ImageOffIcon className="h-6 w-6 text-muted-foreground" />
      <Text.H6 color="foregroundMuted">Image unavailable</Text.H6>
      {mimeType ? <Text.H6 color="foregroundMuted">{mimeType}</Text.H6> : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 hover:underline"
        >
          <ExternalLinkIcon className="h-3.5 w-3.5 text-primary" />
          <Text.H6 color="primary">Open original</Text.H6>
        </a>
      ) : null}
    </div>
  )
}

/**
 * Renders an image content part with loading and error states.
 * `href` is the original openable URL (present for `uri` parts, omitted for inline `blob`
 * data URIs); when set, an "open in new tab" affordance is shown.
 */
export function ImageContent({
  src,
  mimeType,
  href,
}: {
  readonly src: string
  readonly mimeType?: string | undefined
  readonly href?: string | undefined
}) {
  const [status, setStatus] = useState<MediaStatus>("loading")

  if (status === "error") {
    return <ImageErrorPlaceholder mimeType={mimeType} href={href} />
  }

  return (
    <div className="group/media relative inline-flex">
      {status === "loading" ? <div className={cn(PLACEHOLDER_BOX, "animate-pulse bg-muted")} /> : null}
      <img
        src={src}
        alt="Attached content"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        // Kept in the DOM (but collapsed) while loading so the request fires under the skeleton.
        className={cn(
          "max-w-md max-h-64 rounded-lg object-contain",
          status === "loading" && "absolute h-0 w-0 opacity-0",
        )}
      />
      {status === "loaded" && href ? <OpenOriginalButton href={href} /> : null}
    </div>
  )
}
