import { isManualQueue, isSystemQueue } from "@domain/annotation-queues"
import type { InfiniteTableInfiniteScroll, InfiniteTableSorting } from "@repo/ui"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import {
  type AnnotationQueueRecord,
  deleteAnnotationQueue,
  getAnnotationQueueByProject,
  listAnnotationQueuesByProject,
  updateAnnotationQueue,
} from "./annotation-queues.functions.ts"

const queryClient = getQueryClient()

const BATCH_SIZE = 50
const LIST_FETCH_PAGE_SIZE = 200

export const annotationQueueQueryKey = (projectId: string, queueId: string) =>
  ["annotation-queue", projectId, queueId] as const

export const annotationQueuesProjectQueryKey = (projectId: string) => ["annotation-queues", projectId] as const

export const ANNOTATION_QUEUES_DEFAULT_SORTING: InfiniteTableSorting = {
  column: "createdAt",
  direction: "desc",
}

async function fetchAllAnnotationQueuesForProject(projectId: string): Promise<AnnotationQueueRecord[]> {
  const all: AnnotationQueueRecord[] = []
  let cursor: { sortValue: string; id: string } | undefined
  while (true) {
    const page = await listAnnotationQueuesByProject({
      data: {
        projectId,
        limit: LIST_FETCH_PAGE_SIZE,
        cursor,
        sortBy: "createdAt",
        sortDirection: "desc",
      },
    })
    const queues = page?.queues ?? []
    all.push(...queues)
    if (!page?.hasMore || page.nextCursor === undefined) {
      break
    }
    cursor = page.nextCursor
  }
  return all
}

function compareIds(aId: string, bId: string, direction: "asc" | "desc"): number {
  if (aId === bId) return 0
  const asc = aId < bId ? -1 : 1
  return direction === "desc" ? -asc : asc
}

function compareQueues(a: AnnotationQueueRecord, b: AnnotationQueueRecord, sorting: InfiniteTableSorting): number {
  const direction = sorting.direction
  const primaryDir = direction === "asc" ? 1 : -1

  switch (sorting.column) {
    case "name": {
      const c = a.name.localeCompare(b.name)
      if (c !== 0) return c * primaryDir
      return compareIds(a.id, b.id, direction)
    }
    case "completed": {
      const c = a.completedItems - b.completedItems
      if (c !== 0) return c * primaryDir
      return compareIds(a.id, b.id, direction)
    }
    case "pending": {
      const pa = Math.max(0, a.totalItems - a.completedItems)
      const pb = Math.max(0, b.totalItems - b.completedItems)
      const c = pa - pb
      if (c !== 0) return c * primaryDir
      return compareIds(a.id, b.id, direction)
    }
    default: {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      const c = ta - tb
      if (c !== 0) return c * primaryDir
      return compareIds(a.id, b.id, direction)
    }
  }
}

const annotationQueuesCollections: Record<string, ReturnType<typeof createAnnotationQueuesCollection>> = {}

function createAnnotationQueuesCollection(projectId: string) {
  return createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: annotationQueuesProjectQueryKey(projectId),
      queryFn: async () => fetchAllAnnotationQueuesForProject(projectId),
      getKey: (item: AnnotationQueueRecord) => item.id,
      onUpdate: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((mutation) =>
            updateAnnotationQueue({
              data: {
                projectId,
                queueId: String(mutation.key),
                name: mutation.modified.name,
                description: mutation.modified.description,
                instructions: mutation.modified.instructions,
                assignees: [...mutation.modified.assignees],
                ...(Object.keys(mutation.modified.settings).length > 0 ? { settings: mutation.modified.settings } : {}),
              },
            }),
          ),
        )
      },
      onDelete: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((mutation) =>
            deleteAnnotationQueue({
              data: {
                projectId,
                queueId: String(mutation.key),
              },
            }),
          ),
        )
      },
    }),
  )
}

function getAnnotationQueuesCollection(projectId: string) {
  if (!annotationQueuesCollections[projectId]) {
    annotationQueuesCollections[projectId] = createAnnotationQueuesCollection(projectId)
  }
  return annotationQueuesCollections[projectId]
}

export function updateAnnotationQueueMutation(
  projectId: string,
  queueId: string,
  updater: (draft: AnnotationQueueRecord) => void,
) {
  return getAnnotationQueuesCollection(projectId).update(queueId, updater)
}

export function deleteAnnotationQueueMutation(projectId: string, queueId: string) {
  return getAnnotationQueuesCollection(projectId).delete(queueId)
}

function useAnnotationQueuesLive(projectId: string) {
  const collection = projectId.length > 0 ? getAnnotationQueuesCollection(projectId) : null
  return useLiveQuery((q) => (collection === null ? undefined : q.from({ queue: collection })), [projectId, collection])
}

export function useAnnotationQueuesInfiniteScroll({
  projectId,
  sorting,
}: {
  readonly projectId: string
  readonly sorting: InfiniteTableSorting
}) {
  const { data: rows = [], isLoading } = useAnnotationQueuesLive(projectId)
  const [windowSize, setWindowSize] = useState(BATCH_SIZE)

  const sorted = useMemo(() => {
    if (rows.length === 0) return rows
    return [...rows].sort((a, b) => compareQueues(a, b, sorting))
  }, [rows, sorting])

  const data = useMemo(() => sorted.slice(0, windowSize), [sorted, windowSize])

  const hasMore = sorted.length > windowSize

  const loadMore = useCallback(() => {
    setWindowSize((n) => n + BATCH_SIZE)
  }, [])

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore,
      isLoadingMore: false,
      onLoadMore: loadMore,
    }),
    [hasMore, loadMore],
  )

  return { data, isLoading, infiniteScroll, resetWindow: () => setWindowSize(BATCH_SIZE) }
}

export function useAnnotationQueue({
  projectId,
  queueId,
  enabled = true,
}: {
  readonly projectId: string
  readonly queueId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: annotationQueueQueryKey(projectId, queueId),
    queryFn: () => getAnnotationQueueByProject({ data: { projectId, queueId } }),
    enabled: enabled && projectId.length > 0 && queueId.length > 0,
  })
}

export function useAnnotationQueuesList(projectId: string) {
  const { data: rows = [], isLoading } = useAnnotationQueuesLive(projectId)

  const data = useMemo(() => {
    return rows.filter((q) => !isSystemQueue(q) && isManualQueue(q.settings))
  }, [rows])

  return { data, isLoading }
}
