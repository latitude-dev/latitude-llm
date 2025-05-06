import { useCommits } from '$/stores/commitsStore'
import { LOG_SOURCES } from '@latitude-data/core/browser'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { useMemo } from 'react'

export function useDefaultLogFilterOptions() {
  const { commit } = useCurrentCommit()
  const { data: commits } = useCommits()
  return useMemo(() => {
    return {
      commitIds: commits
        ?.filter((c) => !!c.mergedAt || c.uuid === commit.uuid)
        .map((c) => c.id),
      logSources: LOG_SOURCES,
      createdAt: undefined,
      customIdentifier: undefined,
      experimentId: undefined,
    }
  }, [commits, commit])
}
