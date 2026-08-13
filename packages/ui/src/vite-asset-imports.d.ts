// Keep the declaration exact so misspelled `?url` imports still fail typechecking.
declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const workerUrl: string
  export default workerUrl
}
