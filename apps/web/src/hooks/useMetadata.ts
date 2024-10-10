'use client'

import { useEffect, useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { useDebouncedCallback } from 'use-debounce'

type Props = Parameters<typeof readMetadata>[0]
export function useMetadata(props: Props) {
  const [propsQueue, setPropsQueue] = useState<Props | null>(props)

  useEffect(() => {
    setPropsQueue(props)
  }, Object.values(props))

  const [isLoading, setIsLoading] = useState(false)
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  const runReadMetadata = useDebouncedCallback(
    (props: Props, onSuccess: (data: ConversationMetadata) => void) => {
      readMetadata(props).then(onSuccess)
    },
    500,
    { trailing: true },
  )

  useEffect(() => {
    if (isLoading) return
    if (!propsQueue) return

    setIsLoading(true)
    setPropsQueue(null)

    runReadMetadata(propsQueue, (m) => {
      setMetadata(m)
      setIsLoading(false)
    })
  }, [isLoading, propsQueue])

  return { metadata, isLoading }
}
