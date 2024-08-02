import { useCallback } from 'react'

import { Commit, CommitStatus } from '@latitude-data/core/browser'
import {
  useCurrentCommit,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import { createDraftCommitAction } from '$/actions/commits/create'
import { fetchCommitsByProjectAction } from '$/actions/commits/fetchCommitsByProjectAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useCommits(opts?: SWRConfiguration) {
  const { project } = useCurrentProject()
  useCurrentCommit
  const { toast } = useToast()

  const fetcher = useCallback(async () => {
    const [data, error] = await fetchCommitsByProjectAction({
      projectId: project.id,
      status: CommitStatus.Draft,
    })
    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })

      return []
    }

    return data
  }, [project.id, toast])

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<Commit[]>(
    ['commits', project.id, CommitStatus.Draft],
    fetcher,
    opts,
  )
  const { execute: createDraft } = useLatitudeAction(createDraftCommitAction, {
    onSuccess: async ({ data: draft }) => {
      mutate([...data, draft])

      toast({
        title: 'Success',
        description: 'New Draft version ' + draft.title + ' created',
      })
    },
  })

  return { data: data ?? [], mutate, ...rest, createDraft }
}
