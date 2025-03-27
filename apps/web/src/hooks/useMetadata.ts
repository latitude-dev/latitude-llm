'use client'

import { useEffect, useRef, useState } from 'react'

import type { ConversationMetadata } from 'promptl-ai'
import { useDebouncedCallback } from 'use-debounce'
import type { ReadMetadataWorkerProps } from '../workers/readMetadata'

let workerPath: string | null = null

async function getWorkerUrl(): Promise<string | null> {
  if (workerPath) return workerPath

  return fetch('/workers/worker-manifest.json')
    .then((res) => res.json())
    .then((manifest) => manifest['readMetadata.js'])
    .catch((err) => {
      console.error('Failed to load worker manifest:', err)
      return null
    })
}

export function useMetadata() {
  const workerRef = useRef<Worker | null>(null)
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const initWorker = async () => {
      workerPath = await getWorkerUrl()

      if (!workerPath) return

      // NOTE: This auto called function avoids TP1001
      // Turbopack from statically analyzing the worker file
      const worker = new window.Worker(workerPath)
      workerRef.current = worker

      worker.onmessage = (event) => {
        setMetadata(event.data)
      }
    }

    initWorker()

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const runReadMetadata = useDebouncedCallback(
    async (props: ReadMetadataWorkerProps) => {
      workerRef.current?.postMessage(props)
    },
    500,
    { trailing: true },
  )

  return { metadata, runReadMetadata }
}
