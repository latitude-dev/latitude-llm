import { type ComponentProps, lazy, Suspense } from "react"
import { Skeleton } from "../skeleton/skeleton.tsx"

const PdfPreviewLazy = lazy(() => import("./pdf-preview.tsx").then((m) => ({ default: m.PdfPreview })))

/**
 * Lazy-loaded {@link PdfPreview} that defers the pdf.js bundle (~450 kB plus a 1.2 MB worker)
 * until a PDF is actually rendered.
 */
export function LazyPdfPreview(props: ComponentProps<typeof PdfPreviewLazy>) {
  return (
    <Suspense fallback={props.showThumbnail ? <Skeleton className="h-80 w-60 rounded-lg" /> : null}>
      <PdfPreviewLazy {...props} />
    </Suspense>
  )
}
