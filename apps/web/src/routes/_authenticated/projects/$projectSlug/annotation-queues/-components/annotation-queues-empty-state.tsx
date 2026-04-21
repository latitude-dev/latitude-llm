import { Button, Icon, Text } from "@repo/ui"
import { LayersIcon, LayersPlusIcon } from "lucide-react"

export function AnnotationQueuesEmptyState({
  onCreate,
}: {
  readonly onCreate: () => void
}) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={LayersIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3>No annotation queues yet</Text.H3>
          <Text.H5 color="foregroundMuted">
            Annotation queues let you and your teammates review traces and label them for evaluation. Create your first
            queue to get started.
          </Text.H5>
        </div>
        <Button onClick={onCreate}>
          <Icon size="sm" icon={LayersPlusIcon} />
          Create queue
        </Button>
      </div>
    </div>
  )
}
