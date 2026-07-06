import { toast } from "@repo/ui"
import { parseServerError } from "../errors.ts"

/**
 * `_tag` of the server-side error the showcase read-only write-gate will throw
 * (Phase 2). Matched here so the future "read-only showcase" modal branch can be
 * lit up without re-touching this file. No code throws it today — the write-gate
 * is unwired and scope defaults to live — so the branch below is dormant.
 */
export const READ_ONLY_PROJECT_ERROR_TAG = "ReadOnlyProjectError"

interface HandleMutationErrorOptions {
  /**
   * Whether an otherwise-unhandled generic error should surface as a toast.
   * The collection safety net (see `createAppCollection`) only reaches here for
   * errors no caller observed, so it defaults to `true`. The `useMutation` path
   * (`MutationCache.onError`) passes `false` unless a mutation opts in, because
   * its callers already surface their own errors (`mutateAsync` + catch, per-call
   * `onError`, form handlers) and a global toast would double-handle them.
   */
  readonly toastGenericError?: boolean
}

/**
 * Single sink for mutation errors from both mutation styles: TanStack Query
 * `useMutation` (via `MutationCache.onError`) and TanStack DB collections (via
 * `createAppCollection`). TanStack DB has no global/collection `onError`, so
 * collection errors otherwise surface only through `tx.isPersisted.promise` and
 * an un-awaited one becomes an unhandled promise rejection — routing both paths
 * here closes that gap. Owns only otherwise-unhandled errors: callers that catch
 * an error themselves opt out at their layer, so this never double-toasts them.
 */
export function handleMutationError(error: unknown, options: HandleMutationErrorOptions = {}): void {
  const { toastGenericError = true } = options
  const parsed = parseServerError(error)

  if (parsed._tag === READ_ONLY_PROJECT_ERROR_TAG) {
    // DORMANT (showcase Phase 2): open the "read-only showcase — create your own
    // project" modal and route to /projects. Dispatch a CustomEvent here (keep
    // this file .ts) — a provider mounted at the app root listens, holds the open
    // state locally, and renders the modal; this function runs outside React
    // (MutationCache.onError / a promise .catch) so it can't render JSX itself.
    // The write-gate that throws this never fires today, so this is a no-op now.
    // See spec 'Read-only enforcement' layer 3 + D13.
    return
  }

  if (toastGenericError) {
    toast({ variant: "destructive", description: parsed.message })
  }
}
