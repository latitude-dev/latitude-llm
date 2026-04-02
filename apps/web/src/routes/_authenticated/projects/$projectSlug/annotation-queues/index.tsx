import {
  AvatarGroup,
  Button,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  Text,
  Tooltip,
} from "@repo/ui"
import { mapByEntityId, relativeTime } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import {
  ANNOTATION_QUEUES_DEFAULT_SORTING,
  useAnnotationQueuesInfiniteScroll,
} from "../../../../../domains/annotation-queues/annotation-queues.collection.ts"
import type { AnnotationQueueRecord } from "../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { useMemberByUserIdMap } from "../../../../../domains/members/members.collection.ts"
import { pickUsersFromMembersMap } from "../../../../../domains/members/pick-users-from-members.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { AqListBreadcrumb } from "./-components/aq-list-breadcrumb.tsx"
import { QueueBadge } from "./-components/queue-badge.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/annotation-queues/")({
  staticData: {
    breadcrumb: AqListBreadcrumb,
  },
  component: AnnotationQueuesPage,
})

function AnnotationQueuesPage() {
  const { projectSlug } = Route.useParams()
  const navigate = useNavigate()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const [sorting, setSorting] = useState<InfiniteTableSorting>(ANNOTATION_QUEUES_DEFAULT_SORTING)

  const projectId = project?.id ?? ""
  const {
    data: queues,
    isLoading,
    infiniteScroll,
  } = useAnnotationQueuesInfiniteScroll({
    projectId,
    sorting,
  })

  const memberByUserId = useMemberByUserIdMap()
  const assigneeItemsByQueueId = useMemo(
    () => mapByEntityId(queues, (q) => pickUsersFromMembersMap(memberByUserId, q.assignees)),
    [memberByUserId, queues],
  )

  const columns = useMemo((): InfiniteTableColumn<AnnotationQueueRecord>[] => {
    return [
      {
        key: "queue",
        header: "Queue",
        minWidth: 240,
        width: 320,
        sortKey: "name",
        render: (q) => (
          <div className="flex min-w-0 items-center justify-between gap-3 py-0.5">
            <Text.H5 weight="medium" ellipsis lineClamp={3} className="min-w-0 flex-1">
              {q.name}
            </Text.H5>
            <QueueBadge queue={q} />
          </div>
        ),
      },
      {
        key: "instructions",
        header: "Instructions",
        minWidth: 220,
        width: 360,
        render: (q) => (
          <Text.H5 color="foregroundMuted" display="block" lineClamp={3}>
            {q.instructions?.trim() ? q.instructions : "—"}
          </Text.H5>
        ),
      },
      {
        key: "createdAt",
        header: "Created",
        sortKey: "createdAt",
        render: (q) => (
          <Tooltip asChild trigger={<span>{relativeTime(new Date(q.createdAt))}</span>}>
            {new Date(q.createdAt).toLocaleString()}
          </Tooltip>
        ),
      },
      {
        key: "assignees",
        header: "Assigned",
        render: (q) => (
          <AvatarGroup
            items={assigneeItemsByQueueId.get(q.id) ?? []}
            size="md"
            empty={
              <Text.H6 color="foregroundMuted" className="tabular-nums">
                —
              </Text.H6>
            }
          />
        ),
      },
      {
        key: "completed",
        header: "Completed",
        align: "end",
        sortKey: "completed",
        render: (q) => (
          <Text.H6 color="foregroundMuted" className="tabular-nums">
            {q.completedItems}
          </Text.H6>
        ),
      },
      {
        key: "pending",
        header: "Pending",
        align: "end",
        sortKey: "pending",
        render: (q) => (
          <Text.H6 color="foregroundMuted" className="tabular-nums">
            {Math.max(0, q.totalItems - q.completedItems)}
          </Text.H6>
        ),
      },
    ]
  }, [assigneeItemsByQueueId])

  const onRowClick = (q: AnnotationQueueRecord) => {
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    void navigate({
      to: "/projects/$projectSlug/annotation-queues/$queueId",
      params: { projectSlug, queueId: q.id },
      state: { queueName: q.name } as { queueName: string },
    })
  }

  const getRowAriaLabel = (q: AnnotationQueueRecord) => `Open queue ${q.name}`

  return (
    <Layout>
      <Layout.Header
        title="Annotation queues"
        description="Review traces organized by queue"
        actions={
          <Button type="button" size="sm">
            New queue
          </Button>
        }
      />
      <Layout.Body>
        <Layout.List>
          <InfiniteTable
            data={queues}
            isLoading={isLoading}
            columns={columns}
            getRowKey={(q) => q.id}
            onRowClick={onRowClick}
            getRowAriaLabel={getRowAriaLabel}
            infiniteScroll={infiniteScroll}
            sorting={sorting}
            defaultSorting={ANNOTATION_QUEUES_DEFAULT_SORTING}
            onSortChange={setSorting}
            blankSlate="No annotation queues yet"
          />
        </Layout.List>
      </Layout.Body>
    </Layout>
  )
}
