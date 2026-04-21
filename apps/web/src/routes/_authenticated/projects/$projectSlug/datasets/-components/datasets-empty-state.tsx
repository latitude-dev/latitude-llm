import { Button, DatabaseAddIcon, Icon, Text } from "@repo/ui"
import { DatabaseIcon } from "lucide-react"

export function DatasetsEmptyState({
  onCreate,
  creating,
}: {
  readonly onCreate: () => void
  readonly creating: boolean
}) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={DatabaseIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3>No datasets yet</Text.H3>
          <Text.H5 color="foregroundMuted">
            Datasets let you curate traces for evaluation and regression testing. Create your first dataset to get
            started.
          </Text.H5>
        </div>
        <Button onClick={onCreate} disabled={creating} isLoading={creating}>
          <Icon size="sm" icon={DatabaseAddIcon} />
          Create dataset
        </Button>
      </div>
    </div>
  )
}
