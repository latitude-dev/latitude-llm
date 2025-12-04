import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { Project } from '@latitude-data/core/schema/models/types/Project'
import { LogSources } from '@latitude-data/constants'

const SIDEBAR_VISIBLE_SOURCES = new Set<LogSources>([
  LogSources.Playground,
  LogSources.Experiment,
])

/**
 * Hook to track which documents are currently running in a project.
 * This is used to show running indicators in the sidebar.
 */
export function useRunningDocuments({
  project,
  commit,
}: {
  project: Pick<Project, 'id'>
  commit: Pick<Commit, 'uuid'>
}) {
  // Use SWR to store a map of document UUID to a set of active run UUIDs
  const { data: runningDocumentsMap = new Map<string, Set<string>>(), mutate } =
    useSWR<Map<string, Set<string>>>(
      ['runningDocuments', project.id, commit.uuid],
      () => new Map<string, Set<string>>(),
      {
        fallbackData: new Map<string, Set<string>>(),
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      },
    )

  const onMessage = useCallback(
    (args: EventArgs<'documentRunStatus'>) => {
      if (!args) return
      if (args.projectId !== project.id) return

      // Only track runs from playground and experiments
      const source = args.run.source
      if (source && !SIDEBAR_VISIBLE_SOURCES.has(source)) {
        return
      }

      mutate(
        (prev) => {
          const next = new Map(prev)
          const runUuids = new Set(next.get(args.documentUuid) || [])

          if (args.event === 'documentRunEnded') {
            runUuids.delete(args.run.uuid)
            if (runUuids.size === 0) {
              next.delete(args.documentUuid)
            } else {
              next.set(args.documentUuid, runUuids)
            }
          } else {
            runUuids.add(args.run.uuid)
            next.set(args.documentUuid, runUuids)
          }

          return next
        },
        {
          revalidate: false,
        },
      )
    },
    [mutate, project.id],
  )

  useSockets({ event: 'documentRunStatus', onMessage })

  // Convert to a map of document UUID to count for easier consumption
  return useMemo(() => {
    const countMap = new Map<string, number>()
    runningDocumentsMap.forEach((runUuids, documentUuid) => {
      countMap.set(documentUuid, runUuids.size)
    })
    return countMap
  }, [runningDocumentsMap])
}
