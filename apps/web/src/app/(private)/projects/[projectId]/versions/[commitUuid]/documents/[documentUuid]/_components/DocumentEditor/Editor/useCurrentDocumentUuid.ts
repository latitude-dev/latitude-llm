import { useParams } from 'next/navigation'
import { useMemo } from 'react'

export function useCurrentDocumentUuid() {
  const { documentUuid } = useParams()
  return useMemo(() => {
    if (Array.isArray(documentUuid)) {
      return documentUuid[0]
    }

    return documentUuid
  }, [documentUuid])
}
