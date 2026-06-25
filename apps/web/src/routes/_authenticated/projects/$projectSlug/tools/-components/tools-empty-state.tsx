import { Button, Icon, Text } from "@repo/ui"
import { ExternalLinkIcon, WrenchIcon } from "lucide-react"

export function ToolsEmptyState({ isLoading = false }: { readonly isLoading?: boolean }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={WrenchIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>{isLoading ? "Loading tools" : "No tools detected yet"}</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            {isLoading
              ? "Preparing your tools view."
              : "Tools appear automatically when your traces include tool definitions on LLM spans or tool-call spans. Instrument your agent with one of the Latitude telemetry SDKs and they will show up here."}
          </Text.H5>
        </div>
        {!isLoading ? (
          <a href="https://docs.latitude.so/observability/tools" target="_blank" rel="noopener noreferrer">
            <Button>
              <Icon size="sm" icon={ExternalLinkIcon} />
              Read the docs
            </Button>
          </a>
        ) : null}
      </div>
    </div>
  )
}
