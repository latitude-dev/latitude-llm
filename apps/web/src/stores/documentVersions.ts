'use client'

import { DocumentVersion, HEAD_COMMIT } from '@latitude-data/core'
import { createDocumentVersionAction } from '$/actions/documents/create'
import useSWR, { SWRConfiguration } from 'swr'

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
  const { mutate, data, ...rest } = useSWR(
    key,
    (url: string) => fetch(url).then((res) => res.json()),
    opts,
  )
  const create = async (payload: {
    commitUuid?: string
    name: string
    documentType?: DocumentVersion['documentType']
    parentId?: number
  }) => {
    try {
      const doc = await createDocumentVersionAction({
        ...payload,
        name: payload.name!,
        commitUuid: payload.commitUuid || HEAD_COMMIT,
      })
      mutate([...data, doc])

      return doc
    } catch (err) {
      console.error(err)
    }
  }

  return { ...rest, key, data, create, mutate }
}
