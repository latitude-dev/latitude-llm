import { ExternalLinkIcon, ImageOffIcon, type LucideIcon, VideoOffIcon, VolumeXIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "../../../utils/cn.ts"
import { Icon } from "../../icons/icons.tsx"
import { Text } from "../../text/text.tsx"

type MediaStatus = "loading" | "loaded" | "error"

// Shared footprint for the loading skeleton and the (box) error placeholder so the
// layout doesn't jump before the real media dimensions are known.
const PLACEHOLDER_BOX = "h-40 w-64 max-w-md rounded-lg"
// Bar footprint for thin, horizontal media (audio) where a square box would look wrong.
const PLACEHOLDER_BAR = "w-72 max-w-md rounded-lg"

/**
 * "Open in new tab" action for media backed by a real URL.
 * - `overlay`: pinned top-right, hover-revealed — for box media (image/video) where it
 *   would otherwise obscure the content.
 * - `inline`: a persistent button sitting beside the media — for the audio bar, which has
 *   no surface to overlay without covering the native controls.
 */
function OpenOriginalButton({
  href,
  label,
  variant = "overlay",
}: {
  readonly href: string
  readonly label: string
  readonly variant?: "overlay" | "inline"
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-opacity hover:text-foreground",
        variant === "overlay"
          ? "absolute right-2 top-2 z-10 bg-background/90 opacity-0 shadow-sm backdrop-blur focus-visible:opacity-100 group-hover/media:opacity-100"
          : "bg-background",
      )}
    >
      <Icon icon={ExternalLinkIcon} size="sm" />
    </a>
  )
}

/** Shown when a media source can't be loaded (missing, expired, blocked, or corrupt). */
function MediaErrorPlaceholder({
  icon: ErrorIcon,
  label,
  mimeType,
  href,
  layout = "box",
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly mimeType?: string | undefined
  readonly href?: string | undefined
  readonly layout?: "box" | "bar"
}) {
  const openLink = href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
      <Icon icon={ExternalLinkIcon} size="sm" color="primary" />
      <Text.H6 color="primary">Open original</Text.H6>
    </a>
  ) : null

  if (layout === "bar") {
    return (
      <div
        className={cn(PLACEHOLDER_BAR, "flex items-center gap-2 border border-dashed border-border bg-card px-3 py-2")}
      >
        <Icon icon={ErrorIcon} size="sm" color="foregroundMuted" className="shrink-0" />
        <Text.H6 color="foregroundMuted">{label}</Text.H6>
        {openLink ? <div className="ml-auto shrink-0">{openLink}</div> : null}
      </div>
    )
  }

  return (
    <div
      className={cn(
        PLACEHOLDER_BOX,
        "flex flex-col items-center justify-center gap-1.5 border border-dashed border-border bg-card p-4 text-center",
      )}
    >
      <Icon icon={ErrorIcon} size="md" color="foregroundMuted" />
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {mimeType ? <Text.H6 color="foregroundMuted">{mimeType}</Text.H6> : null}
      {openLink ? <div className="mt-1">{openLink}</div> : null}
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
  // Reset on src change (e.g. a refreshed signed URL) so a prior error doesn't stick.
  const [lastSrc, setLastSrc] = useState(src)
  if (src !== lastSrc) {
    setLastSrc(src)
    setStatus("loading")
  }

  if (status === "error") {
    return <MediaErrorPlaceholder icon={ImageOffIcon} label="Image unavailable" mimeType={mimeType} href={href} />
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
      {status === "loaded" && href ? <OpenOriginalButton href={href} label="Open image in new tab" /> : null}
    </div>
  )
}

/**
 * Renders a video content part using the native player. No loading skeleton — the
 * native controls handle their own buffering/poster UX. `src` is set directly on the
 * `<video>` element (not a child `<source>`) so its `onError` fires reliably on a failed
 * load; detection is still best-effort. `href` enables the open-in-new-tab affordance.
 */
export function VideoContent({
  src,
  mimeType,
  href,
}: {
  readonly src: string
  readonly mimeType?: string | undefined
  readonly href?: string | undefined
}) {
  const [hasError, setHasError] = useState(false)
  // Reset on src change (e.g. a refreshed signed URL) so a prior error doesn't stick.
  const [lastSrc, setLastSrc] = useState(src)
  if (src !== lastSrc) {
    setLastSrc(src)
    setHasError(false)
  }

  if (hasError) {
    return <MediaErrorPlaceholder icon={VideoOffIcon} label="Video unavailable" mimeType={mimeType} href={href} />
  }

  return (
    <div className="group/media relative inline-flex">
      {/* biome-ignore lint/a11y/useMediaCaption: attachment playback; no caption track is available for arbitrary media */}
      <video src={src} controls onError={() => setHasError(true)} className="max-w-md max-h-64 rounded-lg" />
      {href ? <OpenOriginalButton href={href} label="Open video in new tab" /> : null}
    </div>
  )
}

/**
 * Renders an audio content part using the native player. The player is a thin bar, so the
 * open-original action sits inline beside it (persistent, not a hover overlay) and the error
 * state is a bar-shaped placeholder rather than the square box used for image/video.
 */
export function AudioContent({
  src,
  mimeType,
  href,
}: {
  readonly src: string
  readonly mimeType?: string | undefined
  readonly href?: string | undefined
}) {
  const [hasError, setHasError] = useState(false)
  // Reset on src change (e.g. a refreshed signed URL) so a prior error doesn't stick.
  const [lastSrc, setLastSrc] = useState(src)
  if (src !== lastSrc) {
    setLastSrc(src)
    setHasError(false)
  }

  if (hasError) {
    return (
      <MediaErrorPlaceholder
        icon={VolumeXIcon}
        label="Audio unavailable"
        mimeType={mimeType}
        href={href}
        layout="bar"
      />
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* biome-ignore lint/a11y/useMediaCaption: attachment playback; no caption track is available for arbitrary media */}
      <audio src={src} controls onError={() => setHasError(true)} className="max-w-md" />
      {href ? <OpenOriginalButton href={href} label="Open audio in new tab" variant="inline" /> : null}
    </div>
  )
}
