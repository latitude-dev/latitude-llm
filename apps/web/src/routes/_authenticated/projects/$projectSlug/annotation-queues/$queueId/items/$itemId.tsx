import { Button, Text } from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ListingLayout as Layout } from "../../../../../../../layouts/ListingLayout/index.tsx"
import { QueueItemLeafBreadcrumb } from "../../-components/queue-item-leaf-breadcrumb.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/annotation-queues/$queueId/items/$itemId")({
  staticData: {
    breadcrumb: QueueItemLeafBreadcrumb,
  },
  component: AnnotationQueueItemPlaceholderPage,
})

function AnnotationQueueItemPlaceholderPage() {
  const { projectSlug, queueId, itemId } = Route.useParams()

  return (
    <Layout>
      <Layout.Header
        title="Review queue item"
        description={
          <div className="flex flex-col gap-2">
            <Text.H5 color="foregroundMuted">
              The focused annotation UI for this item is not wired yet. This route is a placeholder until review tools
              land.
            </Text.H5>
            <Text.Mono color="foregroundMuted" display="block" size="h6" wordBreak="all">
              {itemId}
            </Text.Mono>
          </div>
        }
      />
      <Layout.Body>
        <Layout.List>
          <div className="flex flex-col gap-4">
            <Link
              to="/projects/$projectSlug/annotation-queues/$queueId"
              params={{ projectSlug, queueId }}
              className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to queue items
            </Link>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/projects/$projectSlug/annotation-queues/$queueId" params={{ projectSlug, queueId }}>
                  Queue items
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/projects/$projectSlug/annotation-queues" params={{ projectSlug }}>
                  All queues
                </Link>
              </Button>
            </div>
          </div>
        </Layout.List>
      </Layout.Body>
    </Layout>
  )
}
