import { toast } from "@repo/ui"
import { parseServerError } from "../errors.ts"
import { STALE_SERVER_FN_ERROR_TAG } from "../stale-server-fn.ts"

/** `_tag` of the read-only (showcase) write rejection. */
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
    // The read-only "demo" modal is opened once, centrally, by the write-gate
    // client middleware (the single choke point every write flows through). Here
    // we only swallow the error so it isn't also toasted.
    return
  }

  if (parsed._tag === STALE_SERVER_FN_ERROR_TAG) {
    if (typeof window !== "undefined") window.location.reload()
    return
  }

  if (toastGenericError) {
    toast({ variant: "destructive", description: parsed.message })
  }
}
