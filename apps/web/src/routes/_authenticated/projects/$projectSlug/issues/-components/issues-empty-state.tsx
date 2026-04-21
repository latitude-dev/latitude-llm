import { Button, Icon, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"

export function IssuesEmptyState({ projectSlug }: { projectSlug: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={ShieldAlertIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col gap-2">
          <Text.H3>No issues yet</Text.H3>
          <Text.H5 color="foregroundMuted">
            Issues are discovered automatically by grouping failed annotations left on your traces. Start annotating
            traces to surface recurring problems here.
          </Text.H5>
        </div>
        <Link to="/projects/$projectSlug/annotation-queues" params={{ projectSlug }}>
          <Button>Go to annotation queues</Button>
        </Link>
      </div>
    </div>
  )
}
