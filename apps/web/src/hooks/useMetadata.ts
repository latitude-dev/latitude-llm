'use client'

import { useEffect, useRef, useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { useDebouncedCallback } from 'use-debounce'

type Props = Parameters<typeof readMetadata>[0]
export function useMetadata(props: Props) {
  const workerRef = useRef<Worker>(null)

  useEffect(() => {
    workerRef.current = new Worker('/workers/readMetadata.js', {
      type: 'module',
    })

    workerRef.current.onmessage = (event: { data: ConversationMetadata }) => {
      setMetadata(event.data)
      setIsLoading(false)
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const [propsQueue, setPropsQueue] = useState<Props | null>(props)

  useEffect(() => {
    setPropsQueue(props)
  }, Object.values(props))

  const [isLoading, setIsLoading] = useState(false)
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  const runReadMetadata = useDebouncedCallback(
    (props: Props) => {
      workerRef.current!.postMessage(props)
    },
    500,
    { trailing: true },
  )

  useEffect(() => {
    if (isLoading) return
    if (!propsQueue) return

    setIsLoading(true)
    setPropsQueue(null)

    runReadMetadata(propsQueue)
  }, [isLoading, propsQueue])

  return { metadata, isLoading }
}
