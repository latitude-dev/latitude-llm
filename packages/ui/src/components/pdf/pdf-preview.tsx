import { FileTextIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { Icon } from "../icons/icons.tsx"
import { Modal } from "../modal/modal.tsx"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { Text } from "../text/text.tsx"
import type { PageSize } from "./pdf-page-canvas.tsx"
import { PdfPageCanvas } from "./pdf-page-canvas.tsx"
import { PdfViewer } from "./pdf-viewer.tsx"
import { usePdfDocument } from "./use-pdf-document.ts"

const THUMBNAIL_WIDTH = 240
const THUMBNAIL_HEIGHT = 320
const THUMBNAIL_BOX = "h-80 w-60"

function ThumbnailFrame({ children }: { readonly children: React.ReactNode }) {
  return <div className={`flex ${THUMBNAIL_BOX} items-center justify-center rounded-lg bg-muted p-2`}>{children}</div>
}

function ThumbnailError({ label }: { readonly label: string }) {
  return (
    <div
      className={`flex ${THUMBNAIL_BOX} flex-col items-center justify-center gap-1.5 rounded-lg border border-border border-dashed bg-card p-4 text-center`}
    >
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
  readonly url: string
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

  const thumbnailScale = firstPageSize
    ? Math.min(THUMBNAIL_WIDTH / firstPageSize.width, THUMBNAIL_HEIGHT / firstPageSize.height)
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
          type="button"
          onClick={() => onOpenChange(true)}
          tabIndex={-1}
          aria-hidden="true"
          className="rounded-lg"
        >
          {status === "error" ? (
            <ThumbnailError label={error?.label ?? "PDF unavailable"} />
          ) : (
            <ThumbnailFrame>
              {doc && thumbnailScale ? (
                <div className="relative">
                  <PdfPageCanvas doc={doc} pageNumber={1} scale={thumbnailScale} label={`First page of ${title}`} />
                  <span className="absolute right-1 bottom-1 rounded bg-background/90 px-1.5 py-0.5 backdrop-blur">
                    <Text.H6 color="foregroundMuted">{`1 / ${doc.numPages}`}</Text.H6>
                  </span>
                </div>
              ) : (
                <Skeleton className="h-full w-full" />
              )}
            </ThumbnailFrame>
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
        {status === "error" ? <ThumbnailError label={error?.label ?? "PDF unavailable"} /> : viewer}
      </Modal>
    </>
  )
}
