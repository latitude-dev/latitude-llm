import { useCallback, useEffect, useState } from "react"
import { LazyPdfPreview } from "../../pdf/lazy-pdf-preview.tsx"
import { shouldAutoRenderThumbnail } from "../../pdf/pdf-source.ts"
import { FileCard } from "./file-card.tsx"

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
  const [unavailable, setUnavailable] = useState(false)

  const handleUnavailable = useCallback(() => {
    setUnavailable(true)
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!base64) return

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
  }, [base64])

  const url = base64 ? objectUrl : (href ?? null)
  const autoPreview = shouldAutoRenderThumbnail(sizeBytes)
  const title = fileName ?? "PDF document"

  // Mounted before `url` resolves so the band reserves its height from the first paint.
  const previewNode =
    autoPreview || open ? (
      <LazyPdfPreview
        url={url}
        title={title}
        showThumbnail={autoPreview}
        open={open}
        onOpenChange={setOpen}
        onUnavailable={handleUnavailable}
        {...(downloadDataUri ? { downloadHref: downloadDataUri, downloadName: title } : {})}
        {...(base64 && objectUrl ? { openHref: objectUrl } : href ? { openHref: href } : {})}
      />
    ) : null

  return (
    <>
      <FileCard
        {...(fileName ? { fileName } : {})}
        mimeType={mimeType ?? undefined}
        modality="document"
        {...(sizeBytes != null ? { sizeBytes } : {})}
        {...(href ? { href } : {})}
        {...(downloadDataUri ? { downloadDataUri } : {})}
        preview={autoPreview ? previewNode : null}
        {...(unavailable ? {} : { onActivate: () => setOpen(true), activateLabel: "Open PDF preview" })}
      />
      {/* Past the size guard there is no inline band, but the modal still has to mount somewhere. */}
      {autoPreview ? null : previewNode}
    </>
  )
}
