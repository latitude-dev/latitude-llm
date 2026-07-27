/// <reference path="../../vite-asset-imports.d.ts" />
import { GlobalWorkerOptions, getDocument, version } from "pdfjs-dist"
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = workerSrc

// Served by the pdfjs-assets vite plugin. Version-scoped so the URLs can be cached immutably.
const assetBase = `/pdfjs/${version}/`

// These assets are required for CJK maps, scanned-page decoders and base-14 font metrics.
export const documentAssetOptions = {
  cMapUrl: `${assetBase}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${assetBase}standard_fonts/`,
  wasmUrl: `${assetBase}wasm/`,
  iccUrl: `${assetBase}iccs/`,
} as const

export { getDocument }
export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"
