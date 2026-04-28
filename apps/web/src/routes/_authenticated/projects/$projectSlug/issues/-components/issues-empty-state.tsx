import { Button, Icon, Text } from "@repo/ui"
import { SearchAlert } from "lucide-react"

export function IssuesEmptyState() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={SearchAlert} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3>No issues yet</Text.H3>
          <Text.H5 color="foregroundMuted">
            Issues are discovered automatically by grouping failed annotations left on your traces. Start annotating
            traces to surface recurring problems here.
          </Text.H5>
        </div>
        <Button disabled>Waiting for issue discovery</Button>
      </div>
    </div>
  )
}
