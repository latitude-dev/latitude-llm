import { Icon, Select } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { ZoomInIcon } from "lucide-react"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"

/** Saved-search picker for an alert's source: no "All" option, the user must pick a concrete saved search. */
export function SavedSearchSourcePicker({
  projectId,
  projectSlug,
  value,
  onChange,
  disabled,
  errors,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly value: string | null
  readonly onChange: (savedSearchId: string | null) => void
  readonly disabled?: boolean
  readonly errors?: string[] | undefined
}) {
  const navigate = useNavigate()
  const { data: savedSearches, isLoading } = useSavedSearchesList(projectId)

  return (
    <Select<string>
      name="savedSearch"
      label="Saved search"
      description="The alert will watch for matching traces on this saved search"
      options={savedSearches.map((search) => ({ label: search.name, value: search.id }))}
      value={value ?? undefined}
      placeholder="Select a saved search"
      searchable
      searchPlaceholder="Search saved searches…"
      searchableEmptyMessage="No saved searches found"
      loading={isLoading}
      footerAction={{
        label: "Create a new saved search",
        icon: <Icon icon={ZoomInIcon} size="sm" />,
        onClick: () => void navigate({ to: "/projects/$projectSlug", params: { projectSlug } }),
      }}
      {...(disabled ? { disabled: true } : {})}
      {...(errors ? { errors } : {})}
      onChange={(id) => onChange(id ?? null)}
    />
  )
}
