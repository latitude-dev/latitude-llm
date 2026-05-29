import { Button, Icon, Text } from "@repo/ui"
import { ExternalLinkIcon, RadarIcon } from "lucide-react"

export function MonitorsEmptyState({ isLoading = false }: { readonly isLoading?: boolean }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={RadarIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>{isLoading ? "Loading monitors" : "No monitors yet"}</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            {isLoading
              ? "Preparing your monitors view."
              : "Monitors watch your project's issues and searches and open incidents when their alert conditions are met."}
          </Text.H5>
        </div>
        {!isLoading ? (
          <a href="https://docs.latitude.so/monitors/overview" target="_blank" rel="noopener noreferrer">
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
