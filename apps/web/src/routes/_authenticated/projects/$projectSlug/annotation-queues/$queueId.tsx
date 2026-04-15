import { createFileRoute, Outlet } from "@tanstack/react-router"
import { QueueBranchBreadcrumb } from "./-components/queue-branch-breadcrumb.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/annotation-queues/$queueId")({
  staticData: {
    breadcrumb: QueueBranchBreadcrumb,
  },
  component: AnnotationQueueIdLayout,
})

function AnnotationQueueIdLayout() {
  return <Outlet />
}
