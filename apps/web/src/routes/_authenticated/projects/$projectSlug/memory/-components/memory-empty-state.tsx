import { Icon, Text } from "@repo/ui"
import { BrainIcon } from "lucide-react"

export function MemoryUnavailableState() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={BrainIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>Memory isn't available</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            Memory observability isn't enabled for this project.
          </Text.H5>
        </div>
      </div>
    </div>
  )
}

export function MemoryEmptyState({ isLoading = false }: { readonly isLoading?: boolean }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={BrainIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>{isLoading ? "Loading memory" : "No memory stores yet"}</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            {isLoading
              ? "Preparing your memory view."
              : "Memory stores appear when your traces emit memory operations (create, update, search) carrying a store id."}
          </Text.H5>
        </div>
      </div>
    </div>
  )
}
