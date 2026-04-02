import { eq } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { useParams, useRouterState } from "@tanstack/react-router"
import { getAnnotationQueueByProject } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"

/**
 * "Annotation queues" link + queue name. Queue name is plain text on the items list,
 * and a link to the items list when viewing an item detail route.
 */
export function QueueBranchBreadcrumb() {
  const { projectSlug, queueId } = useParams({ strict: false })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isItemDetail = pathname.includes("/items/")

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.slug, projectSlug ?? "\u0000")).findOne(),
    [projectSlug],
  )

  const projectId = project?.id ?? ""

  const { data: queue } = useQuery({
    queryKey: ["annotation-queue", projectId, queueId],
    queryFn: () => getAnnotationQueueByProject({ data: { projectId, queueId: queueId ?? "" } }),
    enabled: projectId.length > 0 && (queueId?.length ?? 0) > 0,
  })

  if (!projectSlug || !queueId) return null

  const listTo = "/projects/$projectSlug/annotation-queues" as const
  const queueItemsTo = "/projects/$projectSlug/annotation-queues/$queueId" as const

  const label = queue?.name?.trim() ? queue.name : "Queue"

  return (
    <>
      <BreadcrumbLink to={listTo} params={{ projectSlug }} className="shrink-0">
        Annotation queues
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      {isItemDetail ? (
        <BreadcrumbLink to={queueItemsTo} params={{ projectSlug, queueId }} className="truncate min-w-0">
          {label}
        </BreadcrumbLink>
      ) : (
        <BreadcrumbText variant="muted" className="truncate">
          {label}
        </BreadcrumbText>
      )}
    </>
  )
}
