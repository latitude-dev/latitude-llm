import { sortBy } from 'lodash-es'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { executeFetch } from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { deserializeProviderLog } from '$/stores/providerLogs'

export async function fetchProviderLogHydrated({
  threadUuid,
}: {
  threadUuid?: string
}) {
  if (!threadUuid) return undefined

  const providerLogs = await executeFetch<ProviderLogDto[]>({
    route: ROUTES.api.providerLogs.root,
    searchParams: { documentLogUuid: threadUuid ?? '' },
    serializer: (rows) => rows.map(deserializeProviderLog),
  })
  const latestProviderLogId = providerLogs
    ? sortBy(providerLogs, 'generatedAt').at(-1)?.id
    : undefined

  if (!latestProviderLogId) return undefined

  const providerLog = await executeFetch<ProviderLogDto | undefined>({
    route: ROUTES.api.providerLogs.detail(latestProviderLogId).root,
  })

  return providerLog
}
