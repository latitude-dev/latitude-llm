import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"
import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"

export function PdfViewerToolbar({
  pageNumber,
  numPages,
  zoomPercent,
  canZoomIn,
  canZoomOut,
  isFitWidth,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  downloadHref,
  downloadName,
  openHref,
}: {
  readonly pageNumber: number
  readonly numPages: number
  readonly zoomPercent: number
  readonly canZoomIn: boolean
  readonly canZoomOut: boolean
  readonly isFitWidth: boolean
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onZoomIn: () => void
  readonly onZoomOut: () => void
  readonly onFitWidth: () => void
  readonly downloadHref?: string | undefined
  readonly downloadName?: string | undefined
  readonly openHref?: string | undefined
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-border border-b px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onPrev}
        disabled={pageNumber <= 1}
        aria-label="Previous page"
      >
        <Icon icon={ChevronLeftIcon} size="sm" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={pageNumber >= numPages}
        aria-label="Next page"
      >
        <Icon icon={ChevronRightIcon} size="sm" />
      </Button>
      <Text.H6 color="foregroundMuted">
        <span aria-live="polite">{`${pageNumber} / ${numPages}`}</span>
      </Text.H6>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onZoomOut}
          disabled={!canZoomOut}
          aria-label="Zoom out"
        >
          <Icon icon={ZoomOutIcon} size="sm" />
        </Button>
        <Text.H6 color="foregroundMuted">{`${zoomPercent}%`}</Text.H6>
        <Button type="button" variant="ghost" size="icon" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in">
          <Icon icon={ZoomInIcon} size="sm" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onFitWidth} pressed={isFitWidth}>
          Fit width
        </Button>
        {openHref ? (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open PDF in new tab"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon={ExternalLinkIcon} size="sm" />
          </a>
        ) : null}
        {downloadHref ? (
          <a
            href={downloadHref}
            download={downloadName}
            aria-label="Download PDF"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon={DownloadIcon} size="sm" />
          </a>
        ) : null}
      </div>
    </div>
  )
}
