export async function* streamToGenerator<R>(
  stream: ReadableStream<R>,
  abortSignal?: AbortSignal,
) {
  const reader = stream.getReader()

  // Set up abort handler to cancel the reader
  const abortHandler = () => {
    reader.cancel('Operation aborted')
  }

  abortSignal?.addEventListener('abort', abortHandler, { once: true })

  try {
    while (true) {
      // Check if already aborted before reading
      if (abortSignal?.aborted) {
        throw new DOMException('Operation aborted', 'AbortError')
      }

      const { done, value } = await reader.read()
      if (done) break

      yield value
    }
  } finally {
    // Clean up the abort listener
    abortSignal?.removeEventListener('abort', abortHandler)
    reader.releaseLock()
  }
}
