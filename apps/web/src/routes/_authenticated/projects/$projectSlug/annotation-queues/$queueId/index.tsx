import { Avatar, InfiniteTable, type InfiniteTableColumn, type InfiniteTableSorting, Text, Tooltip } from "@repo/ui"
import { mapByEntityId, relativeTime } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import {
  ANNOTATION_QUEUE_ITEMS_DEFAULT_SORTING,
  useAnnotationQueueItemsInfiniteScroll,
} from "../../../../../../domains/annotation-queue-items/annotation-queue-items.collection.ts"
import type { AnnotationQueueItemRecord } from "../../../../../../domains/annotation-queue-items/annotation-queue-items.functions.ts"
import { getAnnotationQueueByProject } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { useMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import { pickUserFromMembersMap } from "../../../../../../domains/members/pick-users-from-members.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { QueueBadge } from "../-components/queue-badge.tsx"
import { QueueItemStatusBadge } from "../-components/queue-item-status-badge.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/annotation-queues/$queueId/")({
  component: AnnotationQueueItemsPage,
})

function AnnotationQueueItemsPage() {
  const { projectSlug, queueId } = Route.useParams()
  const navigate = useNavigate()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const projectId = project?.id ?? ""

  const {
    data: queue,
    isLoading: queueLoading,
    isSuccess: queueFetchSuccess,
  } = useQuery({
    queryKey: ["annotation-queue", projectId, queueId],
    queryFn: () => getAnnotationQueueByProject({ data: { projectId, queueId } }),
    enabled: projectId.length > 0 && queueId.length > 0,
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
        key: "createdAt",
        header: "Created",
        sortKey: "createdAt",
        render: (row) => (
          <Tooltip asChild trigger={<span>{relativeTime(new Date(row.createdAt))}</span>}>
            {new Date(row.createdAt).toLocaleString()}
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
        header: "Completed by",
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

  if (projectId.length > 0 && queueFetchSuccess && queue === null) {
    return (
      <Layout>
        <Layout.Header
          title="Queue not found"
          description="This queue may have been removed or you may not have access."
        />
        <Layout.Body>
          <Layout.List>
            <Link
              to="/projects/$projectSlug/annotation-queues"
              params={{ projectSlug }}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← All queues
            </Link>
          </Layout.List>
        </Layout.Body>
      </Layout>
    )
  }

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
