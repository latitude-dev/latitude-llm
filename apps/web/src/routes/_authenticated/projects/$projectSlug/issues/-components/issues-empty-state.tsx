import { Button, Icon, Text } from "@repo/ui"
import { ExternalLinkIcon, SearchAlert } from "lucide-react"

export function IssuesEmptyState({ isLoading = false }: { readonly isLoading?: boolean }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={SearchAlert} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>{isLoading ? "Loading issues" : "No issues yet"}</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            {isLoading
              ? "Preparing your issues view."
              : "Issues are discovered automatically by grouping failed annotations left on your traces. Start annotating traces to surface recurring problems here."}
          </Text.H5>
        </div>
        {!isLoading ? (
          <a href="https://docs.latitude.so/issues/overview" target="_blank" rel="noopener noreferrer">
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
