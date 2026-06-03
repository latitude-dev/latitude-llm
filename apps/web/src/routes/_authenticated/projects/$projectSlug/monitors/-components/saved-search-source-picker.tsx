import { Icon, Select } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { ZoomInIcon } from "lucide-react"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"

/**
 * Searchable saved-search picker for an alert's source. There is **no "All
 * saved searches" option** — the user must pick a concrete saved search. The
 * dropdown carries a "Create a new saved search" footer that navigates to the
 * search page; it stays visible when the project has no saved searches or the
 * filter matches none, so no separate empty state is needed.
 */
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
        onClick: () => void navigate({ to: "/projects/$projectSlug/search", params: { projectSlug } }),
      }}
      {...(disabled ? { disabled: true } : {})}
      {...(errors ? { errors } : {})}
      onChange={(id) => onChange(id ?? null)}
    />
  )
}
