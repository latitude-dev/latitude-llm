import { useCallback } from 'react'

import { Commit, CommitStatus } from '@latitude-data/core/browser'
import {
  useCurrentCommit,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import { createDraftCommitAction } from '$/actions/commits/create'
import { deleteDraftCommitAction } from '$/actions/commits/deleteDraftCommitAction'
import { publishDraftCommitAction } from '$/actions/commits/publishDraftCommitAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useCommits(
  opts: SWRConfiguration & {
    onSuccessCreate?: (commit: Commit) => void
    onSuccessDestroy?: (commit: Commit) => void
    onSuccessPublish?: (commit: Commit) => void
  } = {},
) {
  const { onSuccessCreate, onSuccessDestroy, onSuccessPublish } = opts
  const { project } = useCurrentProject()
  useCurrentCommit
  const { toast } = useToast()

  const fetcher = useCallback(async () => {
    const response = await fetch(
      ROUTES.api.projects.detail(project.id).commits.root,
      { credentials: 'include' },
    )

    if (!response.ok) {
      const error = await response.json()

      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })

      return []
    }

    return await response.json()
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
  const { execute: createDraft, isPending: isCreating } = useLatitudeAction(
    createDraftCommitAction,
    {
      onSuccess: async ({ data: draft }) => {
        mutate([...data, draft])
        onSuccessCreate?.(draft)

        toast({
          title: 'Success',
          description: 'New Draft version ' + draft.title + ' created',
        })
      },
    },
  )
  const { execute: destroyDraft, isPending: isDestroying } = useLatitudeAction(
    deleteDraftCommitAction,
    {
      onSuccess: async ({ data: deletedDraft }) => {
        mutate(data.filter((item) => item.id !== deletedDraft.id))

        onSuccessDestroy?.(deletedDraft)
        toast({
          title: 'Success',
          description: 'Draft version ' + deletedDraft.title + ' deleted',
        })
      },
    },
  )

  const { execute: publishDraft, isPending: isPublishing } = useLatitudeAction(
    publishDraftCommitAction,
    {
      onSuccess: async ({ data: publishedCommit }) => {
        mutate(
          data.map((item) =>
            item.id === publishedCommit.id ? publishedCommit : item,
          ),
        )
        onSuccessPublish?.(publishedCommit)

        toast({
          title: 'Success',
          description: `Commit ${publishedCommit.title} published to production`,
        })
      },
    },
  )

  return {
    data: data ?? [],
    mutate,
    ...rest,
    createDraft,
    isCreating,
    destroyDraft,
    isDestroying,
    publishDraft,
    isPublishing,
  }
}
