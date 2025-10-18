/**
 * Creates a TransformStream for Server-Sent Events (SSE) responses
 * Returns the readable stream, writer, encoder, and a safe close function
 */
export function createSSEStream() {
  // Create a TransformStream to handle the streaming response
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const closeWriter = async () => {
    try {
      await writer.close()
    } catch (_error) {
      // do nothing, writer might be closed already
    }
  }
  const writeError = async (error: Error | unknown) => {
    await writer.write(
      encoder.encode(
        `event: error\ndata: ${JSON.stringify({
          name: error instanceof Error ? error.name : 'UnknownError',
          message:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
          stack: error instanceof Error ? error.stack : undefined,
        })}\n\n`,
      ),
    )
  }

  const write = async (data: string) => {
    try {
      await writer.write(encoder.encode(data))
    } catch (error) {
      await writeError(error)
    }
  }

  return {
    readable,
    write,
    writeError,
    closeWriter,
  }
}
