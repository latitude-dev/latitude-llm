import type { FilterSet } from "@domain/shared"
import { Button, Icon, Text } from "@repo/ui"
import { XIcon } from "lucide-react"
import {
  type FilterMode,
  FiltersBuilderFields,
} from "../../../../../components/filters-builder/filters-builder-fields.tsx"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"

export type { FilterMode }

interface FiltersSidebarProps {
  readonly mode: FilterMode
  readonly projectId: string
  readonly filters: FilterSet
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly onClose: () => void
  /** Filter fields to hide (e.g. `topics` for custom behaviors). */
  readonly excludeFields?: readonly string[]
}

export function FiltersSidebar({
  mode,
  projectId,
  filters,
  onFiltersChange,
  onClose,
  excludeFields,
}: FiltersSidebarProps) {
  return (
    <Layout.Sidebar>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Text.H5>Filters</Text.H5>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <Icon icon={XIcon} size="sm" />
        </Button>
      </div>

      <div className="flex flex-col px-4 overflow-y-auto flex-1">
        <FiltersBuilderFields
          mode={mode}
          projectId={projectId}
          filters={filters}
          onFiltersChange={onFiltersChange}
          {...(excludeFields ? { excludeFields } : {})}
        />
      </div>
    </Layout.Sidebar>
  )
}
