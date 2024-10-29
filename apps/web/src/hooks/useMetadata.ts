'use client'

import { useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { useDebouncedCallback } from 'use-debounce'

type Props = Parameters<typeof readMetadata>[0]

export function useMetadata() {
  const [metadata, setMetadata] = useState<ConversationMetadata>()
  const [isLoading, setIsLoading] = useState(false)

  const runReadMetadata = useDebouncedCallback(
    async (props: Props) => {
      setIsLoading(true)
      const metadata = await readMetadata(props)
      setMetadata(metadata)
      setIsLoading(false)
    },
    500,
    { trailing: true },
  )

  return { metadata, runReadMetadata, isLoading }
}
