import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { ROUTES } from '$/services/routes'
import { stopRunByDocumentAction } from '$/actions/runs/stopByDocument'
import { ActiveRun } from '@latitude-data/constants'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { Project } from '@latitude-data/core/schema/models/types/Project'

/**
 * Hook to fetch and manage active runs for a specific document.
 * Uses the new document-scoped storage for better performance.
 */
export function useActiveRunsByDocument(
  {
    project,
    commit,
    document,
    search,
    realtime = true,
    onRunEnded,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'documentUuid'>
    search?: {
      page?: number
      pageSize?: number
    }
    realtime?: boolean
    onRunEnded?: (runUuid: string) => void
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<ActiveRun[]>(
    ROUTES.api.projects
      .detail(project.id)
      .commits.detail(commit.uuid)
      .documents.detail(document.documentUuid).runs.active,
    {
      searchParams: compactObject({
        page: search?.page?.toString(),
        pageSize: search?.pageSize?.toString(),
      }) as Record<string, string>,
    },
  )

  const { data = [], mutate } = useSWR<ActiveRun[]>(
    [
      'activeRunsByDocument',
      project.id,
      commit.uuid,
      document.documentUuid,
      search?.page,
      search?.pageSize,
    ],
    fetcher,
    opts,
  )

  const { createStreamHandler, hasActiveStream, createAbortController } =
    useStreamHandler()

  const attachRun = useCallback(
    async ({ runUuid }: { runUuid: string }) => {
      const signal = createAbortController()

      const response = await fetch(
        ROUTES.api.projects.detail(project.id).runs.detail(runUuid).attach,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          signal,
        },
      )

      return createStreamHandler(response, signal)
    },
    [project, createAbortController, createStreamHandler],
  )

  const { execute: executeStopRun, isPending: isStoppingRun } =
    useLatitudeAction(stopRunByDocumentAction, {
      onSuccess: async () => {
        // Run stopped successfully - the websocket event will update the UI
      },
    })

  const stopRun = useCallback(
    async (parameters: { runUuid: string }) => {
      return await executeStopRun({
        ...parameters,
        projectId: project.id,
        documentUuid: document.documentUuid,
      })
    },
    [project, document, executeStopRun],
  )

  const onMessage = useCallback(
    (args: EventArgs<'documentRunStatus'>) => {
      if (!realtime) return
      if (!args) return
      if (args.projectId !== project.id) return
      if (args.documentUuid !== document.documentUuid) return

      mutate(
        (prev) => {
          if (!prev) return prev

          // When the run ended, remove it from the list
          if (args.event === 'documentRunEnded') {
            onRunEnded?.(args.run.uuid)
            return prev.filter((run) => run.uuid !== args.run.uuid)
          }

          // Update the run in the list
          // If run is not in the list and we're on page 1 (or no page specified), add it to the beginning
          const existingRun = prev.find((run) => run.uuid === args.run.uuid)
          const isFirstPage = !search?.page || search.page === 1
          if (!existingRun && isFirstPage) {
            return [args.run, ...prev]
          }

          return prev.map((run) =>
            run.uuid === args.run.uuid ? { ...run, ...args.run } : run,
          )
        },
        {
          revalidate: false,
        },
      )
    },
    [
      mutate,
      realtime,
      search?.page,
      project.id,
      document.documentUuid,
      onRunEnded,
    ],
  )

  useSockets({ event: 'documentRunStatus', onMessage })

  return useMemo(
    () => ({
      data,
      mutate,
      attachRun,
      isAttachingRun: hasActiveStream,
      stopRun,
      isStoppingRun,
    }),
    [data, mutate, attachRun, hasActiveStream, stopRun, isStoppingRun],
  )
}

export type ActiveDocumentStore = ReturnType<typeof useActiveRunsByDocument>
