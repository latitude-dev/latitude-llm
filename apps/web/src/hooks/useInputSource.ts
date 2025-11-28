import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  INPUT_SOURCE,
  InputSource,
} from '@latitude-data/core/lib/documentPersistedInputs'

export function useInputSource(
  initialSource: InputSource = INPUT_SOURCE.manual,
) {
  const searchParams = useSearchParams()
  const [source, setSource] = useState<InputSource>(initialSource)

  useEffect(() => {
    const sourceParam = searchParams?.get('source')
    if (
      sourceParam &&
      Object.values(INPUT_SOURCE).includes(sourceParam as InputSource)
    ) {
      setSource(sourceParam as InputSource)
    }
  }, [searchParams])

  return useMemo(
    () => ({
      source,
      setSource,
    }),
    [source],
  )
}
