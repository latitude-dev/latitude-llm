import { useCallback } from 'react'

import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import { useToast } from '@latitude-data/web-ui'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: [] = []
export default function useDocumentLogs(
  {
    documentUuid,
    commitUuid,
    projectId,
    page,
    pageSize,
  }: {
    documentUuid: string
    commitUuid: string
    projectId: number
    page: number | null
    pageSize: number | null
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const { toast } = useToast()
  const fetcher = useCallback(async () => {
    try {
      const response = await fetch(
        // TODO: Move to ROUTES once implemented
        `/api/projects/${projectId}/commits/${commitUuid}/documents/${documentUuid}/documentLogs?page=${page ?? undefined}&pageSize=${pageSize ?? undefined}`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )

      if (!response.ok) {
        const error = await response.json()

        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })

        return []
      }

      return await response
        .json()
        .then((rows) => rows.map(documentLogPresenter))
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      })

      return []
    }
  }, [commitUuid, documentUuid, projectId, toast, page, pageSize])

  const { data = EMPTY_ARRAY, mutate } = useSWR<DocumentLogWithMetadata[]>(
    ['documentLogs', documentUuid, commitUuid, projectId, page, pageSize],
    fetcher,
    { fallbackData },
  )

  return { data, mutate }
}

export function documentLogPresenter(documentLog: DocumentLogWithMetadata) {
  return {
    ...documentLog,
    createdAt: new Date(documentLog.createdAt),
  }
}
