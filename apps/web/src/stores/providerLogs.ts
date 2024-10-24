'use client'

import { compact } from 'lodash-es'

import { ProviderLogDto } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

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
  const fetcher = useFetcher(
    buildRoute({ documentUuid, documentLogUuid, documentLogId }),
    {
      serializer: (rows) => rows.map(deserialize),
    },
  )
  const {
    data = [],
    isLoading,
    error: swrError,
  } = useSWR<ProviderLogDto[]>(
    compact(['providerLogs', documentUuid, documentLogUuid]),
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
  const fetcher = useFetcher(
    providerLogId ? `/api/providerLogs/${providerLogId}` : undefined,
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

function buildRoute({
  documentUuid,
  documentLogUuid,
  documentLogId,
}: {
  documentUuid?: string
  documentLogUuid?: string
  documentLogId?: number
}) {
  if (!documentUuid && !documentLogUuid && !documentLogId) {
    return undefined
  }

  let route = ROUTES.api.providerLogs.root
  if (documentUuid) {
    route += `?documentUuid=${documentUuid}`
  }
  if (documentLogUuid) {
    if (documentUuid) {
      route += '&'
    } else {
      route += '?'
    }

    route += `documentLogUuid=${documentLogUuid}`
  }
  if (documentLogId) {
    if (documentUuid || documentLogUuid) {
      route += '&'
    } else {
      route += '?'
    }

    route += `documentLogId=${documentLogId}`
  }

  return route
}

function deserialize(item: ProviderLogDto) {
  return {
    ...item,
    generatedAt: item.generatedAt ? new Date(item.generatedAt) : null,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
