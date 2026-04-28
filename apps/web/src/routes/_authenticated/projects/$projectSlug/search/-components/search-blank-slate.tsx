import { Icon, Text } from "@repo/ui"
import { SparklesIcon } from "lucide-react"

export function SearchBlankSlate() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8 opacity-75">
      <div className="max-w-lg flex flex-col items-center gap-6">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={SparklesIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>Search your traces</Text.H3>
          <Text.H5 centered color="foregroundMuted">
            Describe what you're looking for in plain language. Search blends keywords with meaning, so phrases like
            "failed payments" or "long latency on signup" work as well as exact matches.
          </Text.H5>
        </div>
      </div>
    </div>
  )
}
