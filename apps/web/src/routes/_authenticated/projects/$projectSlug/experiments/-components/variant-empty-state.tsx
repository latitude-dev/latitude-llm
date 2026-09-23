import { BookmarkPlusIcon, Columns3Icon, PlusIcon } from "lucide-react"
import { BlankSlate } from "../../../../../../components/blank-slate.tsx"

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
    <BlankSlate
      icon={Columns3Icon}
      title="No variants yet"
      description="Add variants to compare sessions, users, tools, signals, and behaviours across different filters, search queries and time ranges."
      actions={[
        { label: "Add variant", icon: PlusIcon, onClick: onAddVariant, disabled },
        { label: "Import from search", icon: BookmarkPlusIcon, onClick: onImportFromSearch, disabled },
      ]}
    />
  )
}
