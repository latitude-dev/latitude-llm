import { useCallback } from 'react'

import type { Commit } from '@latitude-data/core'
import { createCommitAction } from '$/actions/commits/create'
import { getCommitsAction } from '$/actions/commits/fetch'
import useSWR, { SWRConfiguration } from 'swr'
import { useServerAction } from 'zsa-react'

export default function useCommits(
  { projectId }: { projectId: number },
  opts?: SWRConfiguration,
) {
  const key = '/api/commits'
  const { execute } = useServerAction(createCommitAction)
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<Commit[]>(
    key,
    async () => {
      const [commits] = await getCommitsAction({ projectId })
      return commits!
    },
    opts,
  )

  const create = useCallback(async () => {
    const [commit] = await execute({
      projectId: 1,
    })

    mutate([...data, commit as Commit])

    return commit
  }, [execute])

  return { data, create, ...rest }
}
