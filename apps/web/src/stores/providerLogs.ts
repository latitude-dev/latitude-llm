'use client'

import { compact } from 'lodash-es'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { ProviderLogDto } from '@latitude-data/core/schema/types'

export default function useProviderLogs(
  {
    documentUuid,
    documentLogUuid,
    documentLogId,
  }: {
    documentUuid?: string
    documentLogUuid?: string
    documentLogId?: number
  } = {},
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<ProviderLogDto[], ProviderLogDto[]>(
    ROUTES.api.providerLogs.root,
    {
      searchParams: {
        documentUuid: documentUuid ?? '',
        documentLogUuid: documentLogUuid ?? '',
        documentLogId: documentLogId ? String(documentLogId) : '',
      },
      serializer: (rows) => rows.map(deserializeProviderLog),
    },
  )
  const {
    data = [],
    isLoading,
    error: swrError,
  } = useSWR<ProviderLogDto[]>(
    buildKey(documentUuid, documentLogUuid, documentLogId),
    fetcher,
    opts,
  )

  return {
    data,
    isLoading: isLoading,
    error: swrError,
  }
}

export function useProviderLog(
  providerLogId?: number | null,
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<ProviderLogDto | undefined>(
    providerLogId
      ? ROUTES.api.providerLogs.detail(providerLogId).root
      : undefined,
    {
      fallback: null,
    },
  )
  const {
    data = undefined,
    isLoading,
    error: swrError,
  } = useSWR<ProviderLogDto | undefined>(
    compact(['providerLog', providerLogId]),
    fetcher,
    opts,
  )

  return {
    data,
    isLoading,
    error: swrError,
  }
}

export function deserializeProviderLog(item: ProviderLogDto) {
  return {
    ...item,
    generatedAt: item.generatedAt ? new Date(item.generatedAt) : null,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}

function buildKey(
  documentUuid?: string,
  documentLogUuid?: string,
  documentLogId?: number,
) {
  if (!documentUuid && !documentLogUuid && !documentLogId) return undefined

  return compact(['providerLogs', documentUuid, documentLogUuid, documentLogId])
}
