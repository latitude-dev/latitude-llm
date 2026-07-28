export type PdfErrorKind = "password" | "corrupt" | "missing" | "unavailable"

export type PdfError = {
  readonly kind: PdfErrorKind
  readonly label: string
}

const LABELS: Record<PdfErrorKind, string> = {
  password: "Password-protected PDF",
  corrupt: "This PDF is corrupt or unreadable",
  missing: "PDF could not be loaded",
  unavailable: "PDF unavailable",
}

// Matched on `name` rather than `instanceof`: these cross the worker boundary and arrive as
// structured-cloned plain objects, so the prototype chain is gone.
const KIND_BY_EXCEPTION: Record<string, PdfErrorKind> = {
  PasswordException: "password",
  InvalidPDFException: "corrupt",
  MissingPDFException: "missing",
  UnexpectedResponseException: "missing",
  ResponseException: "missing",
}

/** Returns null for cancellations, which are normal teardown rather than a failure state. */
export function classifyPdfError(error: unknown): PdfError | null {
  const name = (error as { name?: string } | null)?.name ?? ""
  if (name === "AbortException" || name === "RenderingCancelledException") return null
  const kind = KIND_BY_EXCEPTION[name] ?? "unavailable"
  return { kind, label: LABELS[kind] }
}
