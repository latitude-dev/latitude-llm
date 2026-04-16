import { annotationQueueItemStatus } from "@domain/annotation-queues"
import { Avatar, InfiniteTable, type InfiniteTableColumn, type InfiniteTableSorting, Text, Tooltip } from "@repo/ui"
import { mapByEntityId, relativeTime } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import z from "zod"
import {
  ANNOTATION_QUEUE_ITEMS_DEFAULT_SORTING,
  useAnnotationQueueItemsInfiniteScroll,
} from "../../../../../../domains/annotation-queue-items/annotation-queue-items.collection.ts"
import type { AnnotationQueueItemRecord } from "../../../../../../domains/annotation-queue-items/annotation-queue-items.functions.ts"
import { useAnnotationQueue } from "../../../../../../domains/annotation-queues/annotation-queues.collection.ts"
import { useMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import { pickUserFromMembersMap } from "../../../../../../domains/members/pick-users-from-members.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { QueueBadge } from "../-components/queue-badge.tsx"
import { QueueItemStatusBadge } from "../-components/queue-item-status-badge.tsx"

const annotationQueueListSearchSchema = z
  .object({
    focus: z.union([z.boolean(), z.string(), z.undefined()]).optional(),
  })
  .transform(({ focus }) => ({
    focus: focus === true || focus === "true" || focus === "1",
  }))

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/annotation-queues/$queueId/")({
  validateSearch: annotationQueueListSearchSchema,
  component: AnnotationQueueItemsPage,
})

function AnnotationQueueItemsPage() {
  const { projectSlug, queueId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const projectId = project?.id ?? ""

  const { data: queue, isLoading: queueLoading } = useAnnotationQueue({
    projectId,
    queueId,
  })

  const [sorting, setSorting] = useState<InfiniteTableSorting>(ANNOTATION_QUEUE_ITEMS_DEFAULT_SORTING)

  const {
    data: items,
    isLoading: itemsLoading,
    infiniteScroll,
  } = useAnnotationQueueItemsInfiniteScroll({
    projectId,
    queueId,
    sorting,
  })

  const focusIntentResolvedRef = useRef(false)

  // TODO(frontend-use-effect-policy): resolve `focus` search param by navigating once items are loaded,
  // paging the infinite list until a non-completed item exists or the queue is exhausted; not mount-only.
  useEffect(() => {
    if (!search.focus) {
      focusIntentResolvedRef.current = false
      return
    }
    if (focusIntentResolvedRef.current) return
    if (!projectId) return
    if (itemsLoading && items.length === 0) return

    const firstReviewItem = items.find((row) => annotationQueueItemStatus(row) !== "completed")

    if (firstReviewItem) {
      focusIntentResolvedRef.current = true
      void navigate({
        to: "/projects/$projectSlug/annotation-queues/$queueId/items/$itemId",
        params: { projectSlug, queueId, itemId: firstReviewItem.id },
        state: { queueName: queue?.name } as { queueName?: string },
        replace: true,
      })
      return
    }

    if (infiniteScroll.hasMore) {
      if (infiniteScroll.isLoadingMore) return
      infiniteScroll.onLoadMore()
      return
    }

    focusIntentResolvedRef.current = true
    void navigate({
      to: "/projects/$projectSlug/annotation-queues/$queueId",
      params: { projectSlug, queueId },
      search: {},
      replace: true,
    })
  }, [
    search.focus,
    projectId,
    projectSlug,
    queueId,
    queue?.name,
    items,
    itemsLoading,
    navigate,
    infiniteScroll.hasMore,
    infiniteScroll.isLoadingMore,
    infiniteScroll.onLoadMore,
  ])

  const memberByUserId = useMemberByUserIdMap()
  const completerByItemId = useMemo(
    () => mapByEntityId(items, (row) => pickUserFromMembersMap(memberByUserId, row.completedBy)),
    [memberByUserId, items],
  )

  const columns = useMemo((): InfiniteTableColumn<AnnotationQueueItemRecord>[] => {
    return [
      {
        key: "trace",
        header: "Trace",
        minWidth: 200,
        render: (row) => (
          <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
            <Text.H5 weight="medium" ellipsis className="min-w-0">
              {row.traceDisplayName}
            </Text.H5>
            <div className="min-w-0">
              <Text.Mono color="foregroundMuted" display="block" size="h7" wordBreak="all">
                {row.traceId}
              </Text.Mono>
            </div>
          </div>
        ),
      },
      {
        key: "traceCreatedAt",
        header: "Trace Created",
        sortKey: "createdAt",
        render: (row) => (
          <Tooltip asChild trigger={<span>{relativeTime(new Date(row.traceCreatedAt))}</span>}>
            {new Date(row.traceCreatedAt).toLocaleString()}
          </Tooltip>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortKey: "status",
        render: (row) => <QueueItemStatusBadge row={row} />,
      },
      {
        key: "completedBy",
        header: "Reviewed by",
        minWidth: 160,
        render: (row) => {
          const u = completerByItemId.get(row.id) ?? null
          return u ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={u.name} imageSrc={u.imageSrc} size="sm" />
              <Text.H5 ellipsis className="min-w-0">
                {u.name}
              </Text.H5>
            </div>
          ) : (
            <Text.H5 color="foregroundMuted">—</Text.H5>
          )
        },
      },
    ]
  }, [completerByItemId])

  const onRowClick = (row: AnnotationQueueItemRecord) => {
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    void navigate({
      to: "/projects/$projectSlug/annotation-queues/$queueId/items/$itemId",
      params: { projectSlug, queueId, itemId: row.id },
      state: { queueName: queue?.name } as { queueName?: string },
    })
  }

  const getRowAriaLabel = (row: AnnotationQueueItemRecord) => `Open queue item for trace ${row.traceDisplayName}`

  return (
    <Layout>
      <Layout.Header
        title={queue?.name ?? (queueLoading ? "Loading…" : "Queue")}
        badge={queue ? <QueueBadge queue={queue} /> : null}
        description={queue?.description?.trim() ? queue.description : undefined}
      />
      <Layout.Body>
        <Layout.List>
          <InfiniteTable
            data={items}
            isLoading={itemsLoading}
            columns={columns}
            getRowKey={(row) => row.id}
            onRowClick={onRowClick}
            rowInteractionRole="link"
            getRowAriaLabel={getRowAriaLabel}
            infiniteScroll={infiniteScroll}
            sorting={sorting}
            defaultSorting={ANNOTATION_QUEUE_ITEMS_DEFAULT_SORTING}
            onSortChange={setSorting}
            blankSlate="No items in this queue"
          />
        </Layout.List>
      </Layout.Body>
    </Layout>
  )
}
