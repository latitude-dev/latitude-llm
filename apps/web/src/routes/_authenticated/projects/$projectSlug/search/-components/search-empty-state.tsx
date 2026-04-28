import { Icon, Text } from "@repo/ui"
import { SearchXIcon } from "lucide-react"

export function SearchEmptyState() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8 opacity-75">
      <div className="max-w-lg flex flex-col items-center gap-6">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={SearchXIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>No traces match your search</Text.H3>
          <Text.H5 centered color="foregroundMuted">
            Try rewording the query or using fewer, more specific keywords. Search blends keywords and meaning, so close
            paraphrases work too. If you're using filters or a time range, widening them can also help.
          </Text.H5>
        </div>
      </div>
    </div>
  )
}
