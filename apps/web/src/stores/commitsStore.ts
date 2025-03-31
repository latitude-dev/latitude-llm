import { Commit, CommitStatus } from '@latitude-data/core/browser'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { createDraftCommitAction } from '$/actions/commits/create'
import { deleteDraftCommitAction } from '$/actions/commits/deleteDraftCommitAction'
import { publishDraftCommitAction } from '$/actions/commits/publishDraftCommitAction'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

type CommitOptions = SWRConfiguration & {
  onSuccessCreate?: (commit: Commit) => void
  onSuccessDestroy?: (commit: Commit) => void
  onSuccessPublish?: (commit: Commit) => void
  commitStatus?: CommitStatus
}

export function useCommits(opts: CommitOptions = {}) {
  const { project } = useCurrentProject()
  return useCommitsFromProject(project.id, opts)
}

export function useCommitsFromProject(
  projectId?: number,
  opts: CommitOptions = {},
) {
  const { onSuccessCreate, onSuccessDestroy, onSuccessPublish, commitStatus } =
    opts
  const { toast } = useToast()
  const route = projectId
    ? ROUTES.api.projects.detail(projectId).commits.root
    : undefined
  const fetcher = useFetcher(
    route
      ? commitStatus
        ? `${route}?status=${commitStatus}`
        : route
      : undefined,
    {
      // Sort by latest version first
      serializer: (data) =>
        data.sort((a: Commit, b: Commit) => {
          if (a.version === null && b.version === null) return 0
          if (a.version === null) return 1
          if (b.version === null) return -1

          return b.version - a.version
        }),
    },
  )

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<Commit[]>(['commits', projectId, commitStatus], fetcher, opts)
  const { execute: createDraft, isPending: isCreating } = useLatitudeAction(
    createDraftCommitAction,
    {
      onSuccess: async ({ data: draft }) => {
        if (!draft) return

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
