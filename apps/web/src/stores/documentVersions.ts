'use client'

import { useCallback } from 'react'

import { DocumentVersion } from '@latitude-data/core'
import { HEAD_COMMIT, type DocumentType } from '@latitude-data/core/browser'
import { createDocumentVersionAction } from '$/actions/documents/create'
import useSWR, { SWRConfiguration } from 'swr'
import { useServerAction } from 'zsa-react'

export default function useDocumentVersions(
  {
    commitUuid,
    projectId,
  }: {
    commitUuid?: string
    projectId: number
  },
  opts?: SWRConfiguration,
) {
  const key = `/api/projects/${projectId}/commits/${commitUuid ?? HEAD_COMMIT}/documents`

  const { mutate, data, ...rest } = useSWR<DocumentVersion[]>(
    key,
    (url: string) => fetch(url).then((res) => res.json()),
    opts,
  )
  const documents = data ?? []
  const { execute } = useServerAction(createDocumentVersionAction)
  const create = useCallback(
    async (payload: {
      name: string
      documentType?: DocumentType
      parentId?: number
    }) => {
      const [document] = await execute({
        ...payload,
        projectId,
        name: payload.name!,
        commitUuid: commitUuid || HEAD_COMMIT,
      })
      const prev = documents ?? []

      if (document) {
        mutate([...prev, document])
      }

      return document
    },
    [execute, mutate, documents],
  )

  return { ...rest, key, documents, create, mutate }
}
