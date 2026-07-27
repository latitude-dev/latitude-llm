import { type ComponentProps, lazy, Suspense } from "react"
import { Skeleton } from "../skeleton/skeleton.tsx"

const PdfPreviewLazy = lazy(() => import("./pdf-preview.tsx").then((m) => ({ default: m.PdfPreview })))

/**
 * Lazy-loaded {@link PdfPreview} that defers the pdf.js bundle (~450 kB plus a 1.2 MB worker)
 * until a PDF is actually rendered.
 */
export function LazyPdfPreview(props: ComponentProps<typeof PdfPreviewLazy>) {
  return (
    // Same footprint as the resolved preview band, so the card doesn't resize on hydration.
    <Suspense fallback={props.showThumbnail ? <Skeleton className="h-56 w-full rounded-none" /> : null}>
      <PdfPreviewLazy {...props} />
    </Suspense>
  )
}
