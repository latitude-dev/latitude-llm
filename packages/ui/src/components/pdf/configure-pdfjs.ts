/// <reference path="../../vite-asset-imports.d.ts" />
import { GlobalWorkerOptions, getDocument, version } from "pdfjs-dist"
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = workerSrc

// Served by the pdfjs-assets vite plugin. Version-scoped so the URLs can be cached immutably.
const assetBase = `/pdfjs/${version}/`

/**
 * Without these pdf.js silently degrades: CJK documents throw from `CMapFactory`, scanned
 * (JBIG2/JPX) pages decode to blank, and base-14 fonts fall back to system metrics.
 */
export const documentAssetOptions = {
  cMapUrl: `${assetBase}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${assetBase}standard_fonts/`,
  wasmUrl: `${assetBase}wasm/`,
  iccUrl: `${assetBase}iccs/`,
} as const

export { getDocument }
export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"
