'use client'

import { useEffect, useState } from 'react'

import type { ConversationMetadata } from 'promptl-ai'
import { useDebouncedCallback } from 'use-debounce'

import type { ReadMetadataWorkerProps } from '../workers/readMetadata'

const worker =
  typeof window === 'undefined'
    ? undefined
    : new Worker(new URL('public/workers/readMetadata', import.meta.url))

export function useMetadata({
  onMetadataProcessed,
}: {
  onMetadataProcessed?: (metadata: ConversationMetadata) => void
} = {}) {
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  useEffect(() => {
    if (typeof window === 'undefined' || !worker) return

    worker.onmessage = (event: { data: ConversationMetadata }) => {
      setMetadata(event.data)
      onMetadataProcessed?.(event.data)
    }
  }, [onMetadataProcessed])

  const runReadMetadata = useDebouncedCallback(
    async (props: ReadMetadataWorkerProps) => {
      worker?.postMessage(props)
    },
    500,
    { trailing: true },
  )

  return { metadata, runReadMetadata }
}
