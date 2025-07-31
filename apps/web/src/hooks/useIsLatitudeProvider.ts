import { useEffect, useState } from 'react'
import { ResolvedMetadata } from '$/workers/readMetadata'
import { envClient } from '$/envClient'

/**
 * INFO: React to metadata changes and send event to provider model picker
 *
 * TODO: Review why this trigger is here. It was here before moving to this file.
 */
export function useIsLatitudeProvider({
  metadata,
}: {
  metadata: ResolvedMetadata | undefined
}) {
  const config = metadata?.config
  const [isLatitudeProvider, setIsLatitudeProvider] = useState<boolean>(false)

  useEffect(() => {
    const providerName = config ? (config.provider as string) : ''
    const isLimited =
      providerName === envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME
    setIsLatitudeProvider(isLimited)
  }, [config])

  return isLatitudeProvider
}
