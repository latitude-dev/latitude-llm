/// <reference path="../../vite-asset-imports.d.ts" />
import { GlobalWorkerOptions, getDocument, PDFWorker, version } from "pdfjs-dist"
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = workerSrc

// Served by the pdfjs-assets vite plugin. Version-scoped so the URLs can be cached immutably.
const assetBase = `/pdfjs/${version}/`

// These assets are required for CJK maps, scanned-page decoders and base-14 font metrics.
const documentAssetOptions = {
  cMapUrl: `${assetBase}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${assetBase}standard_fonts/`,
  wasmUrl: `${assetBase}wasm/`,
  iccUrl: `${assetBase}iccs/`,
} as const

let worker: PDFWorker | null = null

// pdf.js spawns a worker per document unless one is passed in, and sharing it through
// `GlobalWorkerOptions.workerPort` instead would let the first `task.destroy()` tear the worker
// down for every other live document.
function sharedWorker(): PDFWorker {
  if (worker) return worker

  const created = new PDFWorker()
  worker = created

  const forget = () => {
    if (worker === created) worker = null
  }

  // pdf.js drops its own error listener once the handshake lands, so a crash after that point would
  // leave every later document waiting on a dead port instead of getting a fresh worker.
  created.promise.then(() => {
    const port = created.port
    if (typeof port?.addEventListener !== "function") return
    port.addEventListener("error", forget)
    port.addEventListener("messageerror", forget)
  }, forget)

  return created
}

export function loadDocument(url: string) {
  return getDocument({ url, worker: sharedWorker(), ...documentAssetOptions })
}

export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"
