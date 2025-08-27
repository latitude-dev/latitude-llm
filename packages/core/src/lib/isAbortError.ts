/**
 * Checks if an error is an AbortError indicating that an operation was cancelled
 * due to client disconnect or explicit cancellation
 */
export function isAbortError(error: unknown): error is DOMException {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError') ||
    (error instanceof Error &&
      error.message.includes('operation was aborted')) ||
    (error instanceof Error &&
      error.message.includes('This operation was aborted')) ||
    (error instanceof TypeError &&
      error.message.includes('Controller is already closed')) // If aborting the controller while consuming the stream, the enqueue will throw this error
  )
}
