import { type ComponentProps, lazy, Suspense } from "react"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { PREVIEW_HEIGHT } from "./pdf-render-math.ts"

const PdfPreviewLazy = lazy(() => import("./pdf-preview.tsx").then((m) => ({ default: m.PdfPreview })))

/**
 * Lazy-loaded {@link PdfPreview} that defers the pdf.js bundle (~450 kB plus a 1.2 MB worker)
 * until a PDF is actually rendered.
 */
export function LazyPdfPreview(props: ComponentProps<typeof PdfPreviewLazy>) {
  return (
    // Same footprint as the resolved preview band, so the card doesn't resize on hydration.
    <Suspense
      fallback={
        props.showThumbnail ? <Skeleton className="w-full rounded-none" style={{ height: PREVIEW_HEIGHT }} /> : null
      }
    >
      <PdfPreviewLazy {...props} />
    </Suspense>
  )
}
