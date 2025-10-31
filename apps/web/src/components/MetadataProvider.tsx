'use client'

import { useMetadataStore } from '$/hooks/useMetadata'
import { trigger } from '$/lib/events'
import React, { useEffect } from 'react'

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

type MetadataProviderProps = {
  children: React.ReactNode
}

export function MetadataProvider({ children }: MetadataProviderProps) {
  const { setMetadata, setWorker, reset } = useMetadataStore()

  useEffect(() => {
    if (typeof window === 'undefined') return // Only on client code

    const initWorker = async () => {
      workerPath = await getWorkerUrl()
      if (!workerPath) return

      // NOTE: This auto called function avoids TP1001
      // Turbopack from statically analyzing the worker file
      const worker = new window.Worker(workerPath)
      setWorker(worker)

      worker.onmessage = (event) => {
        setMetadata(event.data)
        if (!event.data) return

        trigger('PromptMetadataChanged', {
          promptLoaded: true,
          metadata: event.data,
        })
      }
    }

    initWorker()

    return () => {
      const currentWorker = useMetadataStore.getState().worker
      if (currentWorker) {
        currentWorker.terminate()
        setWorker(null)
      }
      reset()
    }
  }, [setMetadata, setWorker, reset])

  return <>{children}</>
}
