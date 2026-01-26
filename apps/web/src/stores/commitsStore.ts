'use client'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { createDraftCommitAction } from '$/actions/commits/create'
import { deleteDraftCommitAction } from '$/actions/commits/deleteDraftCommitAction'
import { publishDraftCommitAction } from '$/actions/commits/publishDraftCommitAction'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

import { CommitStatus } from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { setCommitMainDocumentAction } from '$/actions/commits/setCommitMainDocumentAction'
import { useEvents } from '$/lib/events'
import { useCallback, useMemo } from 'react'

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
  const fetcher = useFetcher<Commit[], Commit[]>(
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
    error,
    isLoading,
    isValidating,
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
  const {
    execute: executeSetCommitMainDocument,
    isPending: isSettingMainDocument,
  } = useLatitudeAction(setCommitMainDocumentAction, {
    onSuccess: async ({ data: updatedCommit }) => {
      mutate(
        data.map((item) =>
          item.id === updatedCommit.id ? updatedCommit : item,
        ),
      )
    },
  })
  const setCommitMainDocument = useCallback(
    ({
      projectId,
      commitId,
      documentUuid,
    }: {
      projectId: number
      commitId: number
      documentUuid: string | undefined
    }) => {
      // Optimistically update the commit main document
      mutate(
        (data) =>
          data?.map((item) =>
            item.id === commitId
              ? { ...item, mainDocumentUuid: documentUuid ?? null }
              : item,
          ),
        {
          revalidate: false,
        },
      )

      executeSetCommitMainDocument({
        projectId,
        commitId,
        documentUuid,
      })
    },
    [executeSetCommitMainDocument, mutate],
  )

  useEvents({
    onCommitUpdated: (commit) => {
      if (commit.projectId !== projectId) return
      mutate(data.map((item) => (item.id === commit.id ? commit : item)))
    },
  })

  return useMemo(
    () => ({
      data: data ?? [],
      mutate,
      error,
      isLoading,
      isValidating,
      createDraft,
      isCreating,
      destroyDraft,
      isDestroying,
      publishDraft,
      isPublishing,
      setCommitMainDocument,
      isSettingMainDocument,
    }),
    [
      data,
      mutate,
      error,
      isLoading,
      isValidating,
      createDraft,
      isCreating,
      destroyDraft,
      isDestroying,
      publishDraft,
      isPublishing,
      setCommitMainDocument,
      isSettingMainDocument,
    ],
  )
}
