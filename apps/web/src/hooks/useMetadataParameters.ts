import { useMemo, useState, useEffect } from 'react'
import { useEvents } from '$/lib/events'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { useMetadata } from './useMetadata'

export function useMetadataParameters() {
  const { metadata } = useMetadata()
  const [parameters, setParameters] = useState<string[]>([])

  useEffect(() => {
    if (metadata?.parameters) {
      setParameters(Array.from(metadata.parameters))
    }
  }, [metadata])

  useEvents({
    onPromptMetadataChanged: ({ metadata }: { metadata: ResolvedMetadata }) => {
      setParameters(Array.from(metadata.parameters))
    },
  })

  return useMemo(
    () => ({
      parameters,
    }),
    [parameters],
  )
}
