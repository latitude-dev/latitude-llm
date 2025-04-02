import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { Commit, DiffValue } from '@latitude-data/core/browser'

export function useDocumentDiff(
  {
    commit,
    documentUuid,
  }: {
    commit?: Commit
    documentUuid?: string
  },
  opts: SWRConfiguration = {},
) {
  const route =
    commit && documentUuid
      ? ROUTES.api.projects
          .detail(commit.projectId)
          .commits.detail(commit.uuid)
          .changes.detail(documentUuid).root
      : undefined

  const fetcher = useFetcher<DiffValue>(route)
  const { data, ...rest } = useSWR<DiffValue>(
    ['documentDiff', commit?.id, documentUuid],
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
