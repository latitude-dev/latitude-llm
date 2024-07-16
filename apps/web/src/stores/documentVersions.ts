'use client'

import { useCallback } from 'react'

import { DocumentVersion } from '@latitude-data/core'
import { HEAD_COMMIT, type DocumentType } from '@latitude-data/core/browser'
import { createDocumentVersionAction } from '$/actions/documents/create'
import { getDocumentsAtCommitAction } from '$/actions/documents/fetch'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentVersions(
  {
    commitUuid = HEAD_COMMIT,
    projectId,
  }: {
    commitUuid?: string
    projectId: number
  },
  opts?: SWRConfiguration,
) {
  const key = `/api/projects/${projectId}/commits/${commitUuid ?? HEAD_COMMIT}/documents`

  const {
    mutate,
    data = [],
    ...rest
  } = useSWR<DocumentVersion[]>(
    key,
    async () => {
      const [data, err] = await getDocumentsAtCommitAction({
        projectId,
        commitUuid,
      })

      if (err) {
        console.error(err)

        return []
      }

      return data!
    },
    opts,
  )
  const create = useCallback(
    async (payload: {
      name: string
      documentType?: DocumentType
      parentId?: number
    }) => {
      const [document, err] = await createDocumentVersionAction({
        ...payload,
        projectId,
        name: payload.name!,
        commitUuid: commitUuid || HEAD_COMMIT,
      })

      if (err) {
        console.error(err)

        return
      }

      if (document) {
        mutate([...data, document])
      }

      return document
    },
    [mutate, data],
  )

  return { ...rest, key, data, create, mutate }
}
