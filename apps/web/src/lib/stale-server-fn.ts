// TanStack Start throws this when a stale tab calls a server-fn hash from a prior deploy.
export const STALE_SERVER_FN_ERROR_TAG = "StaleServerFnError"

export const STALE_SERVER_FN_USER_MESSAGE = "This page is out of date. Please reload."

const MISSING_SERVER_FN_MESSAGE = /^Server function info not found for [a-f0-9]{64}$/

export const isMissingServerFnErrorMessage = (message: string): boolean => MISSING_SERVER_FN_MESSAGE.test(message)

export const isMissingServerFnError = (error: unknown): boolean =>
  error instanceof Error && isMissingServerFnErrorMessage(error.message)
