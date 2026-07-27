import { ScanEyeIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Icon } from "../../icons/icons.tsx"
import { LazyPdfPreview } from "../../pdf/lazy-pdf-preview.tsx"
import { shouldAutoRenderThumbnail } from "../../pdf/pdf-source.ts"
import { Tooltip } from "../../tooltip/tooltip.tsx"
import { FileCard } from "./file-card.tsx"

const ACTION_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"

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

  const expandAction = (
    <Tooltip
      asChild
      trigger={
        <button type="button" onClick={() => setOpen(true)} aria-label="Open PDF preview" className={ACTION_CLASS}>
          <Icon icon={ScanEyeIcon} size="sm" />
        </button>
      }
    >
      {autoPreview ? "Open PDF preview" : "Large file — open the preview to render it"}
    </Tooltip>
  )

  return (
    <div className="flex flex-col gap-2">
      {url && (autoPreview || open) ? (
        <LazyPdfPreview
          url={url}
          title={title}
          showThumbnail={autoPreview}
          open={open}
          onOpenChange={setOpen}
          {...(downloadDataUri ? { downloadHref: downloadDataUri, downloadName: title } : {})}
          {...(base64 && objectUrl ? { openHref: objectUrl } : href ? { openHref: href } : {})}
        />
      ) : null}
      <FileCard
        {...(fileName ? { fileName } : {})}
        mimeType={mimeType ?? undefined}
        modality="document"
        {...(sizeBytes != null ? { sizeBytes } : {})}
        {...(href ? { href } : {})}
        {...(downloadDataUri ? { downloadDataUri } : {})}
        extraActions={expandAction}
      />
    </div>
  )
}
