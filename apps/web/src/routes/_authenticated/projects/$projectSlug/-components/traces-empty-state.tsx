import { Button, Icon, Text } from "@repo/ui"
import { TelescopeIcon } from "lucide-react"

export function TracesEmptyState() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={TelescopeIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3>No traces yet</Text.H3>
          <Text.H5 color="foregroundMuted">
            Traces capture every LLM call your application makes. Instrument your app with the Latitude SDK to start
            streaming traces into this project.
          </Text.H5>
        </div>
        <a href="https://docs.latitude.so" target="_blank" rel="noopener noreferrer">
          <Button>Read the docs</Button>
        </a>
      </div>
    </div>
  )
}
