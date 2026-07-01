import type { PreviewEvaluationRow } from "../use-cases/preview-evaluation.ts"

/** How long a computed preview result lives in Redis before the poller must re-request. */
export const SIGNAL_PREVIEW_RESULT_TTL_SECONDS = 300

/** Org-prefixed key the `signals-preview` worker writes and the web poller reads. */
export const buildSignalPreviewResultKey = (organizationId: string, previewId: string): string =>
  `org:${organizationId}:signalPreview:${previewId}`

/** The transport contract between the preview worker (writer) and the web poller (reader). */
export type SignalPreviewResult =
  | { readonly status: "pending" }
  | { readonly status: "done"; readonly items: readonly PreviewEvaluationRow[] }
  | { readonly status: "error"; readonly error: string }
