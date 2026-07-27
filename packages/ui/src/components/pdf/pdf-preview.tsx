import { FileTextIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { Icon } from "../icons/icons.tsx"
import { Modal } from "../modal/modal.tsx"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { Text } from "../text/text.tsx"
import type { PageSize } from "./pdf-page-canvas.tsx"
import { PdfPageCanvas } from "./pdf-page-canvas.tsx"
import { PdfViewer } from "./pdf-viewer.tsx"
import { useElementWidth } from "./use-element-width.ts"
import { usePdfDocument } from "./use-pdf-document.ts"

/** Fixed so the card footprint is identical before and after the page resolves. */
const PREVIEW_HEIGHT = 224
const PREVIEW_PADDING = 24

function PreviewMessage({ label }: { readonly label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 text-center">
      <Icon icon={FileTextIcon} size="md" color="foregroundMuted" />
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
    </div>
  )
}

export function PdfPreview({
  url,
  title,
  showThumbnail,
  open,
  onOpenChange,
  downloadHref,
  downloadName,
  openHref,
}: {
  /** Null until an inline blob has been turned into an object URL. */
  readonly url: string | null
  readonly title: string
  readonly showThumbnail: boolean
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly downloadHref?: string | undefined
  readonly downloadName?: string | undefined
  readonly openHref?: string | undefined
}) {
  const [mounted, setMounted] = useState(false)
  useMountEffect(() => {
    setMounted(true)
  })

  const bandRef = useRef<HTMLButtonElement | null>(null)
  const bandWidth = useElementWidth(bandRef, PREVIEW_PADDING)

  const { doc, status, error } = usePdfDocument(mounted ? url : null)
  const [firstPageSize, setFirstPageSize] = useState<PageSize | null>(null)

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    void doc.getPage(1).then((page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale: 1 })
      setFirstPageSize({ width: viewport.width, height: viewport.height })
    })
    return () => {
      cancelled = true
    }
  }, [doc])

  // Contain rather than fill: a landscape page must not be cropped to the band height.
  const previewScale =
    firstPageSize && bandWidth > 0
      ? Math.min(bandWidth / firstPageSize.width, (PREVIEW_HEIGHT - PREVIEW_PADDING) / firstPageSize.height)
      : null

  const viewer = doc ? (
    <PdfViewer
      doc={doc}
      title={title}
      {...(downloadHref ? { downloadHref } : {})}
      {...(downloadName ? { downloadName } : {})}
      {...(openHref ? { openHref } : {})}
    />
  ) : null

  return (
    <>
      {showThumbnail ? (
        // Redundant click target for the card's "Open PDF preview" action, so it stays out of the
        // tab order and is not announced twice.
        <button
          ref={bandRef}
          type="button"
          onClick={() => onOpenChange(true)}
          tabIndex={-1}
          aria-hidden="true"
          className="flex w-full items-center justify-center overflow-hidden bg-muted"
          style={{ height: PREVIEW_HEIGHT }}
        >
          {status === "error" ? (
            <PreviewMessage label={error?.label ?? "PDF unavailable"} />
          ) : doc && previewScale ? (
            <div className="relative">
              <PdfPageCanvas doc={doc} pageNumber={1} scale={previewScale} label={`First page of ${title}`} />
              <span className="absolute right-1 bottom-1 rounded bg-background/90 px-1.5 py-0.5 backdrop-blur">
                <Text.H6 color="foregroundMuted">{`1 / ${doc.numPages}`}</Text.H6>
              </span>
            </div>
          ) : (
            <Skeleton className="h-full w-full rounded-none" />
          )}
        </button>
      ) : null}

      <Modal
        open={open}
        onOpenChange={onOpenChange}
        dismissible
        size="full"
        height="screen"
        scrollable={false}
        title={title}
      >
        {status === "error" ? <PreviewMessage label={error?.label ?? "PDF unavailable"} /> : viewer}
      </Modal>
    </>
  )
}
