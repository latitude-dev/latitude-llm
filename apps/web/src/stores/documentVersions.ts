'use client'

import { useCallback } from 'react'

import { DocumentVersion } from '@latitude-data/core'
import { HEAD_COMMIT, type DocumentType } from '@latitude-data/core/browser'
import { createDocumentVersionAction } from '$/actions/documents/create'
import useSWR, { SWRConfiguration } from 'swr'
import { useServerAction } from 'zsa-react'

const FIXME_HARDCODED_PROJECT_ID = 1
export default function useDocumentVersions(
  {
    commitUuid = HEAD_COMMIT,
    staged = false,
  }: {
    commitUuid?: string
    staged?: boolean
  },
  opts?: SWRConfiguration,
) {
  const key =
    `/api/commits/${commitUuid}/documents?` +
    new URLSearchParams({
      staged: String(staged),
    }).toString()

  const { mutate, data, ...rest } = useSWR<DocumentVersion[]>(
    key,
    (url: string) => fetch(url).then((res) => res.json()),
    opts,
  )
  const documents = data ?? []
  const { execute } = useServerAction(createDocumentVersionAction)
  const create = useCallback(
    async (payload: {
      commitUuid?: string
      name: string
      documentType?: DocumentType
      parentId?: number
    }) => {
      const [document] = await execute({
        ...payload,
        projectId: FIXME_HARDCODED_PROJECT_ID,
        name: payload.name!,
        commitUuid: payload.commitUuid || HEAD_COMMIT,
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
