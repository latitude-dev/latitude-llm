'use client'

import { useEffect, useRef, useState } from 'react'

import type { ConversationMetadata } from 'promptl-ai'
import { useDebouncedCallback } from 'use-debounce'
import type { ReadMetadataWorkerProps } from '../workers/readMetadata'

async function getManifest() {
  return fetch('/workers/worker-manifest.json')
    .then((res) => res.json())
    .then((manifest) => manifest['readMetadata.js'])
    .catch((err) => {
      console.error('Failed to load worker manifest:', err)
      return null
    })
}
export function useMetadata({
  onMetadataProcessed,
}: {
  onMetadataProcessed?: (metadata: ConversationMetadata) => void
} = {}) {
  const workerRef = useRef<Worker | null>(null)
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const initWorker = async () => {
      const workerPath = await getManifest()

      if (!workerPath) return

      // NOTE: This auto called function avoids TP1001
      // Turbopack from statically analyzing the worker file
      const worker = new window.Worker(workerPath)
      workerRef.current = worker

      worker.onmessage = (event) => {
        setMetadata(event.data)
        onMetadataProcessed?.(event.data)
      }
    }

    initWorker()

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
