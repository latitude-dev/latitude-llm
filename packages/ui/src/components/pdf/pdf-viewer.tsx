import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "../../utils/cn.ts"
import type { PDFDocumentProxy } from "./configure-pdfjs.ts"
import { type PageSize, PdfPageCanvas } from "./pdf-page-canvas.tsx"
import { clampPage, fitWidthScale, MAX_ZOOM, MIN_ZOOM, mostVisiblePage, nextZoom } from "./pdf-render-math.ts"
import { PdfViewerToolbar } from "./pdf-viewer-toolbar.tsx"
import { useElementWidth } from "./use-element-width.ts"

/**
 * A full-width page at DPR 2 is roughly 25 MB of backing store, so an unbounded render window
 * OOMs the tab on a long document. Pages outside it fall back to a sized placeholder.
 */
const MAX_RENDERED_PAGES = 5

const PAGE_GAP = 16
const HORIZONTAL_PADDING = 32

export function PdfViewer({
  doc,
  title,
  downloadHref,
  downloadName,
  openHref,
}: {
  readonly doc: PDFDocumentProxy
  readonly title: string
  readonly downloadHref?: string | undefined
  readonly downloadName?: string | undefined
  readonly openHref?: string | undefined
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef(new Map<number, HTMLElement>())
  const containerWidth = useElementWidth(scrollRef, HORIZONTAL_PADDING)

  const numPages = doc.numPages
  const [zoom, setZoom] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [visiblePages, setVisiblePages] = useState<readonly number[]>([1])
  const [pageSizes, setPageSizes] = useState<ReadonlyMap<number, PageSize>>(new Map())

  const referenceSize = pageSizes.get(currentPage) ?? pageSizes.get(1)
  const fitScale = referenceSize ? fitWidthScale({ containerWidth, pageWidth: referenceSize.width }) : 1
  const scale = zoom ?? fitScale

  const onMeasured = useCallback((pageNumber: number, size: PageSize) => {
    setPageSizes((previous) => {
      const existing = previous.get(pageNumber)
      if (existing && existing.width === size.width && existing.height === size.height) return previous
      const next = new Map(previous)
      next.set(pageNumber, size)
      return next
    })
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root || typeof IntersectionObserver === "undefined") return

    const renderObserver = new IntersectionObserver(
      (entries) => {
        setVisiblePages((previous) => {
          const next = new Set(previous)
          for (const entry of entries) {
            const pageNumber = Number(entry.target.getAttribute("data-page"))
            if (!pageNumber) continue
            if (entry.isIntersecting) next.add(pageNumber)
            else next.delete(pageNumber)
          }
          const sorted = [...next].sort((a, b) => a - b)
          return sorted.length > 0 ? sorted : previous
        })
      },
      { root, rootMargin: "100% 0px" },
    )

    const viewportIntersections = new Map<number, number>()
    const viewportObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number(entry.target.getAttribute("data-page"))
          if (!pageNumber) continue
          if (entry.isIntersecting) viewportIntersections.set(pageNumber, entry.intersectionRatio)
          else viewportIntersections.delete(pageNumber)
        }

        const pageNumber = mostVisiblePage(viewportIntersections)
        if (pageNumber) setCurrentPage(pageNumber)
      },
      { root },
    )

    for (const element of pageRefs.current.values()) {
      renderObserver.observe(element)
      viewportObserver.observe(element)
    }
    return () => {
      renderObserver.disconnect()
      viewportObserver.disconnect()
    }
  }, [numPages])

  // Bounded window centred on the current page — at low zoom the visible set alone can be large.
  const renderWindow = useMemo(() => {
    if (visiblePages.length <= MAX_RENDERED_PAGES) return new Set(visiblePages)
    const start = Math.max(0, visiblePages.indexOf(currentPage))
    return new Set(visiblePages.slice(start, start + MAX_RENDERED_PAGES))
  }, [visiblePages, currentPage])

  const scrollToPage = useCallback((pageNumber: number) => {
    pageRefs.current.get(pageNumber)?.scrollIntoView({ block: "start" })
  }, [])

  const goToPage = useCallback(
    (pageNumber: number) => {
      const target = clampPage(pageNumber, numPages)
      setCurrentPage(target)
      scrollToPage(target)
    },
    [numPages, scrollToPage],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) return

      if (event.key === "ArrowRight") goToPage(currentPage + 1)
      else if (event.key === "ArrowLeft") goToPage(currentPage - 1)
      else if (event.key === "+" || event.key === "=") setZoom((z) => nextZoom(z ?? fitScale, "in"))
      else if (event.key === "-") setZoom((z) => nextZoom(z ?? fitScale, "out"))
      else if (event.key === "0") setZoom(null)
      else return

      event.preventDefault()
    }

    globalThis.addEventListener("keydown", onKeyDown)
    return () => globalThis.removeEventListener("keydown", onKeyDown)
  }, [currentPage, fitScale, goToPage])

  const fallbackSize = pageSizes.get(1)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
      <PdfViewerToolbar
        pageNumber={currentPage}
        numPages={numPages}
        zoomPercent={Math.round(scale * 100)}
        canZoomIn={scale < MAX_ZOOM}
        canZoomOut={scale > MIN_ZOOM}
        isFitWidth={zoom === null}
        onPrev={() => goToPage(currentPage - 1)}
        onNext={() => goToPage(currentPage + 1)}
        onZoomIn={() => setZoom(nextZoom(scale, "in"))}
        onZoomOut={() => setZoom(nextZoom(scale, "out"))}
        onFitWidth={() => setZoom(null)}
        {...(downloadHref ? { downloadHref } : {})}
        {...(downloadName ? { downloadName } : {})}
        {...(openHref ? { openHref } : {})}
      />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-muted p-4">
        <div className="flex flex-col items-center" style={{ gap: PAGE_GAP }}>
          {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNumber) => {
            const size = pageSizes.get(pageNumber) ?? fallbackSize
            const placeholderHeight = size ? Math.floor(size.height * scale) : undefined
            const placeholderWidth = size ? Math.floor(size.width * scale) : undefined

            return (
              <div
                key={pageNumber}
                data-page={pageNumber}
                ref={(element) => {
                  if (element) pageRefs.current.set(pageNumber, element)
                  else pageRefs.current.delete(pageNumber)
                }}
                className="flex shrink-0 items-center justify-center"
                style={{ height: placeholderHeight, width: placeholderWidth }}
              >
                {renderWindow.has(pageNumber) ? (
                  <PdfPageCanvas
                    doc={doc}
                    pageNumber={pageNumber}
                    scale={scale}
                    label={`Page ${pageNumber} of ${numPages} — ${title}`}
                    onMeasured={onMeasured}
                  />
                ) : (
                  <div className={cn("h-full w-full rounded-sm bg-background/60 ring-1 ring-black/5")} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
