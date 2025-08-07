'use client'

import { debounce } from 'lodash-es'
import { useMemo } from 'react'
import { create } from 'zustand'
import type { ReadMetadataWorkerProps, ResolvedMetadata } from '../workers/readMetadata'

type MetadataState = {
  metadata: ResolvedMetadata | undefined
  worker: Worker | null
  setMetadata: (metadata: ResolvedMetadata | undefined) => void
  setWorker: (worker: Worker | null) => void
  updateMetadata: (props: ReadMetadataWorkerProps) => void
  reset: () => void
}

export const useMetadataStore = create<MetadataState>((set, get) => ({
  metadata: undefined,
  worker: null,
  setMetadata: (metadata) => set({ metadata }),
  setWorker: (worker) => set({ worker }),
  updateMetadata: debounce(
    async (props: ReadMetadataWorkerProps) => {
      const { worker } = get()
      worker?.postMessage(props)
    },
    500,
    { trailing: true },
  ),
  reset: () => set({ metadata: undefined, worker: null }),
}))

export function useMetadata() {
  const { metadata, updateMetadata } = useMetadataStore()

  return useMemo(() => ({ metadata, updateMetadata }), [metadata, updateMetadata])
}
