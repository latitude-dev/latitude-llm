import { Button, Icon, Text } from "@repo/ui"
import { BookmarkPlusIcon, Columns3Icon, PlusIcon } from "lucide-react"

/**
 * Centered empty-state for an experiment with no variants yet. Mirrors `BlankSlate`'s layout but
 * offers two actions: add a blank variant, or seed one from a saved search's filters + query.
 */
export function ExperimentVariantsEmptyState({
  onAddVariant,
  onImportFromSearch,
  disabled,
}: {
  readonly onAddVariant: () => void
  readonly onImportFromSearch: () => void
  readonly disabled?: boolean
}) {
  return (
    <div className="h-full w-full flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={Columns3Icon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>No variants yet</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            Add variants to compare sessions, users, tools, signals, and behaviours across different filters, search
            queries and time ranges.
          </Text.H5>
        </div>
        <div className="flex items-center gap-2">
          <Button disabled={disabled} onClick={onAddVariant}>
            <Icon size="sm" icon={PlusIcon} />
            Add variant
          </Button>
          <Button variant="outline" disabled={disabled} onClick={onImportFromSearch}>
            <Icon size="sm" icon={BookmarkPlusIcon} />
            Import from search
          </Button>
        </div>
      </div>
    </div>
  )
}
