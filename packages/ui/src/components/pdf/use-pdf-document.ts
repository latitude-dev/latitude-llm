import { useEffect, useState } from "react"
import type { PDFDocumentProxy } from "./configure-pdfjs.ts"
import { classifyPdfError, type PdfError } from "./pdf-errors.ts"

type PdfDocumentState = {
  readonly doc: PDFDocumentProxy | null
  readonly status: "loading" | "loaded" | "error"
  readonly error: PdfError | null
}

const INITIAL: PdfDocumentState = { doc: null, status: "loading", error: null }

/**
 * Loads a PDF into a single document proxy. pdf.js is pulled in here rather than imported at
 * module scope so it is never evaluated during SSR, where `React.lazy` children still render.
 */
export function usePdfDocument(url: string | null): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>(INITIAL)

  useEffect(() => {
    if (!url) {
      setState(INITIAL)
      return
    }

    let cancelled = false
    let destroy: (() => void) | null = null
    setState(INITIAL)
    ;(async () => {
      const { loadDocument } = await import("./configure-pdfjs.ts")
      if (cancelled) return

      const task = loadDocument(url)
      // Destroying the loading task also destroys the document it produced; don't destroy both.
      destroy = () => void task.destroy()

      try {
        const doc = await task.promise
        if (cancelled) return
        setState({ doc, status: "loaded", error: null })
      } catch (error) {
        // A revoked blob URL or an aborted fetch during teardown lands here; `cancelled` filters it.
        if (cancelled) return
        // An unclassified cancellation is not a failure, and surfacing it as one would strip the
        // card's open affordance for the rest of the session.
        const classified = classifyPdfError(error)
        if (!classified) return
        setState({ doc: null, status: "error", error: classified })
      }
    })()

    return () => {
      cancelled = true
      destroy?.()
    }
  }, [url])

  return state
}
