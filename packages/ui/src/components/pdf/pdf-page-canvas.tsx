import { useEffect, useRef, useState } from "react"
import { cn } from "../../utils/cn.ts"
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "./configure-pdfjs.ts"
import { computePixelRatio } from "./pdf-render-math.ts"

export type PageSize = { readonly width: number; readonly height: number }

export function PdfPageCanvas({
  doc,
  pageNumber,
  scale,
  label,
  onMeasured,
  className,
}: {
  readonly doc: PDFDocumentProxy
  readonly pageNumber: number
  readonly scale: number
  readonly label: string
  /** Reports the unscaled page box so the surrounding slot can size its placeholder. */
  readonly onMeasured?: ((pageNumber: number, size: PageSize) => void) | undefined
  readonly className?: string | undefined
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const taskRef = useRef<RenderTask | null>(null)
  const [isRendering, setIsRendering] = useState(true)

  useEffect(() => {
    let cancelled = false
    let page: PDFPageProxy | null = null

    const run = async () => {
      setIsRendering(true)

      taskRef.current?.cancel()
      // cancel() settles on a later tick; starting a second render before it does throws in pdf.js.
      await taskRef.current?.promise.catch(() => {})
      if (cancelled) return

      page = await doc.getPage(pageNumber)
      const canvas = canvasRef.current
      if (cancelled || !canvas) return

      const unscaled = page.getViewport({ scale: 1 })
      onMeasured?.(pageNumber, { width: unscaled.width, height: unscaled.height })

      const base = page.getViewport({ scale })
      const ratio = computePixelRatio({
        cssWidth: base.width,
        cssHeight: base.height,
        devicePixelRatio: globalThis.devicePixelRatio ?? 1,
      })
      const viewport = page.getViewport({ scale: scale * ratio })

      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${Math.floor(base.width)}px`
      canvas.style.height = `${Math.floor(base.height)}px`

      const task = page.render({ canvas, viewport })
      taskRef.current = task
      try {
        await task.promise
        if (!cancelled) setIsRendering(false)
      } catch {
        // Cancellation is normal teardown; a real failure leaves the blank canvas in place.
      }
    }

    void run()

    return () => {
      cancelled = true
      taskRef.current?.cancel()
      const canvas = canvasRef.current
      // Zeroing the dimensions is what actually releases the backing store.
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
      page?.cleanup()
    }
  }, [doc, pageNumber, scale, onMeasured])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      aria-busy={isRendering}
      className={cn("bg-white shadow-sm ring-1 ring-black/10", className)}
    />
  )
}
