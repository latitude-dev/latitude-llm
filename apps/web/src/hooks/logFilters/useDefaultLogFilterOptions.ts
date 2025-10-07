import { useCommits } from '$/stores/commitsStore'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useMemo } from 'react'
import { LOG_SOURCES } from '@latitude-data/core/constants'

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
