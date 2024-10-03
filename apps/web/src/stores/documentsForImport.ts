import { useCallback } from 'react'

import { useToast } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

interface DocumentForImport {
  documentUuid: string
  path: string
}

export default function useDocumentsForImport(
  { projectId }: { projectId?: number },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useCallback(async () => {
    if (!projectId) return []

    const response = await fetch(
      ROUTES.api.documents.detail({ projectId }).forImport.root,
      {
        credentials: 'include',
      },
    )

    if (!response.ok) {
      const error = await response.json()
      toast({
        title: 'Error fetching documents for import',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      })
      return []
    }

    return response.json()
  }, [projectId, toast])

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<DocumentForImport[]>(
    ['api/documents/for-import', projectId],
    fetcher,
    opts,
  )

  return { data, mutate, ...rest }
}
