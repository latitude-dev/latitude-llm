import { useCallback, useEffect, useRef, useState } from "react"
import { useMountEffect } from "../../../hooks/use-mount-effect.ts"
import { LazyPdfPreview } from "../../pdf/lazy-pdf-preview.tsx"
import { PREVIEW_HEIGHT } from "../../pdf/pdf-render-math.ts"
import { isInlineRenderableUrl, shouldAutoRenderThumbnail } from "../../pdf/pdf-source.ts"
import { useHasBeenInView } from "../../pdf/use-has-been-in-view.ts"
import { FileCard } from "./file-card.tsx"

/** A screen of lead time, so a page is decoded before the card is scrolled to. */
const PRELOAD_MARGIN = "100% 0px"

/**
 * Wraps {@link FileCard} for PDFs with an inline first-page thumbnail and an expandable viewer.
 * Inline bytes become a blob URL: pdf.js detaches an ArrayBuffer passed as `data`, so a second
 * load of the same part would throw, and a blob URL is navigable where a data URI is not.
 */
export function PdfAttachment({
  fileName,
  mimeType,
  sizeBytes,
  base64,
  href,
  downloadDataUri,
}: {
  readonly fileName?: string | undefined
  readonly mimeType?: string | null | undefined
  readonly sizeBytes?: number | undefined
  readonly base64?: string | undefined
  readonly href?: string | undefined
  readonly downloadDataUri?: string | undefined
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [activated, setActivated] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const bandRef = useRef<HTMLDivElement | null>(null)

  const autoPreview = shouldAutoRenderThumbnail(sizeBytes)
  // Conversations are not virtualized, so without this gate every PDF in a thread decodes at once.
  const revealed = useHasBeenInView(bandRef, PRELOAD_MARGIN) || activated
  const showBand = autoPreview && revealed
  // Latches, unlike `open`: revoking the object URL when the modal closes would leave `objectUrl`
  // holding a dead string, and reopening would then fail the load and mark the card unavailable.
  const wantsBytes = autoPreview ? revealed : activated

  const handleActivate = useCallback(() => {
    setActivated(true)
    setOpen(true)
  }, [])

  const handleUnavailable = useCallback(() => {
    setUnavailable(true)
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!base64 || !wantsBytes) return

    let cancelled = false
    let created: string | null = null
    // fetch() decodes the base64 natively; an atob loop over a 20 MB payload blocks the main thread.
    void fetch(`data:application/pdf;base64,${base64}`)
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setObjectUrl(created)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [base64, wantsBytes])

  const url = base64 ? objectUrl : (href ?? null)
  const title = fileName ?? "PDF document"

  // Mounted before `url` resolves so the band reserves its height from the first paint.
  const previewNode =
    showBand || open ? (
      <LazyPdfPreview
        url={url}
        title={title}
        showThumbnail={showBand}
        open={open}
        onOpenChange={setOpen}
        onUnavailable={handleUnavailable}
        {...(downloadDataUri ? { downloadHref: downloadDataUri, downloadName: title } : {})}
        {...(base64 && objectUrl ? { openHref: objectUrl } : href ? { openHref: href } : {})}
      />
    ) : null

  // Same height and fill as the resolved band, and the element the observer watches.
  const placeholder = <div ref={bandRef} className="w-full bg-muted" style={{ height: PREVIEW_HEIGHT }} />

  return (
    <>
      <FileCard
        {...(fileName ? { fileName } : {})}
        mimeType={mimeType ?? undefined}
        modality="document"
        {...(sizeBytes != null ? { sizeBytes } : {})}
        {...(href ? { href } : {})}
        {...(downloadDataUri ? { downloadDataUri } : {})}
        preview={autoPreview ? (showBand ? previewNode : placeholder) : null}
        {...(unavailable ? {} : { onActivate: handleActivate, activateLabel: "Open PDF preview" })}
      />
      {/* Past the size guard there is no inline band, but the modal still has to mount somewhere. */}
      {autoPreview ? null : previewNode}
    </>
  )
}

export function PdfUriAttachment({
  fileName,
  mimeType,
  href,
}: {
  readonly fileName?: string | undefined
  readonly mimeType?: string | null | undefined
  readonly href: string
}) {
  const [inlinePreview, setInlinePreview] = useState(false)

  useMountEffect(() => {
    setInlinePreview(isInlineRenderableUrl(href, globalThis.location?.origin))
  })

  if (!inlinePreview) {
    return (
      <FileCard {...(fileName ? { fileName } : {})} mimeType={mimeType ?? undefined} modality="document" href={href} />
    )
  }

  return <PdfAttachment {...(fileName ? { fileName } : {})} mimeType={mimeType ?? undefined} href={href} />
}
