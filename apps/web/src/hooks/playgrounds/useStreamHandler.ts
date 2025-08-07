import { EventSourceParserStream } from 'eventsource-parser/stream'
import { useCallback, useEffect, useRef } from 'react'

export function useStreamHandler() {
  const abortControllerRef = useRef<AbortController | null>(null)

  // Clean up any active streams when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const createStreamHandler = useCallback(async (response: Response) => {
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API request failed: ${response.status} ${errorText}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    // Abort any existing stream before creating a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create a new AbortController for this request
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const reader = response.body.getReader()
    const parser = new EventSourceParserStream()

    // Create a ReadableStream from the reader
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Listen for abort signal
          signal.addEventListener('abort', () => {
            reader.cancel('Stream aborted by user')

            try {
              controller.close()
            } catch (_) {
              // do nothing, stream might be closed already
            }
          })

          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              controller.close()
              break
            }

            controller.enqueue(value)
          }
        } catch (error) {
          controller.error(error)
        }
      },
      cancel(reason) {
        reader.cancel(reason)
      },
    })

    return stream.pipeThrough(new TextDecoderStream()).pipeThrough(parser)
  }, [])

  const abortCurrentStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      return true
    }
    return false
  }, [])

  const hasActiveStream = useCallback(() => !!abortControllerRef.current, [])

  return {
    createStreamHandler,
    abortCurrentStream,
    hasActiveStream,
  }
}
