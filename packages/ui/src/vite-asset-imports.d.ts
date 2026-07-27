/**
 * Vite's `?url` suffix resolves an import to the emitted asset's public URL. `vite/client` is
 * referenced nowhere in this repo — packages are source-consumed and typechecked by tsgo, not by
 * Vite — so declare the exact specifiers we use rather than a `*?url` wildcard that would silently
 * accept typos.
 */
declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const workerUrl: string
  export default workerUrl
}
