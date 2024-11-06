'use client'

import { useEffect, useRef, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { useDebouncedCallback } from 'use-debounce'

import type { ReadMetadataWorkerProps } from '../workers/readMetadata'

export function useMetadata({
  onMetadataProcessed,
}: {
  onMetadataProcessed?: (metadata: Set<string>) => void
} = {}) {
  const [metadata, setMetadata] = useState<ConversationMetadata>()
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    workerRef.current = new Worker('/workers/readMetadata.js')

    workerRef.current.onmessage = (event: { data: ConversationMetadata }) => {
      setMetadata(event.data)
      onMetadataProcessed?.(event.data.parameters)
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [onMetadataProcessed])

  const runReadMetadata = useDebouncedCallback(
    async (props: ReadMetadataWorkerProps) => {
      workerRef.current?.postMessage(props)
    },
    500,
    { trailing: true },
  )

  return { metadata, runReadMetadata }
}
