import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { Commit } from '@latitude-data/core/browser'
import { CommitChanges } from '@latitude-data/constants'

const NO_CHANGES = {
  anyChanges: false,
  hasIssues: false,
  documents: {
    hasErrors: false,
    all: [],
    clean: [],
    errors: [],
  },
  triggers: {
    hasPending: false,
    all: [],
    clean: [],
    pending: [],
  },
} satisfies CommitChanges

export function useCommitsChanges(
  {
    commit,
  }: {
    commit?: Commit
  },
  opts: SWRConfiguration = {},
) {
  const route = commit
    ? ROUTES.api.projects.detail(commit.projectId).commits.detail(commit.uuid)
        .changes.root
    : undefined

  const fetcher = useFetcher<CommitChanges>(route)

  const { data = NO_CHANGES, ...rest } = useSWR<CommitChanges>(
    ['commitChanges', commit?.projectId, commit?.uuid],
    fetcher,
    opts,
  )

  return {
    data: data ?? NO_CHANGES,
    ...rest,
  }
}
