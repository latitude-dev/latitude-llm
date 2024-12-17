import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { ChangedDocument } from '@latitude-data/core/repositories'
import { Commit } from '@latitude-data/core/browser'

export function useCommitsChanges(
  commit?: Commit,
  opts: SWRConfiguration = {},
) {
  const route = commit
    ? ROUTES.api.projects.detail(commit.projectId).commits.detail(commit.uuid)
        .changes.root
    : undefined

  const fetcher = useFetcher(route)

  const { data = [], ...rest } = useSWR<ChangedDocument[]>(
    ['commitChanges', commit?.projectId, commit?.uuid],
    fetcher,
    opts,
  )

  return {
    data: data ?? [],
    ...rest,
  }
}
