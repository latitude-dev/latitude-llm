import { Select, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"

/**
 * Searchable saved-search picker for an alert's source. There is **no "All
 * saved searches" option** — the user must pick a concrete saved search. When
 * the project has none, an inline link points at the search page where saved
 * searches are created.
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
  const { data: savedSearches, isLoading } = useSavedSearchesList(projectId)

  if (!isLoading && savedSearches.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <Text.H6M>Saved search</Text.H6M>
        <Text.H6 color="foregroundMuted">
          This project has no saved searches yet.{" "}
          <Link
            to="/projects/$projectSlug/search"
            params={{ projectSlug }}
            className="text-primary underline underline-offset-2"
          >
            Create a saved search
          </Link>{" "}
          to monitor.
        </Text.H6>
      </div>
    )
  }

  return (
    <Select<string>
      name="savedSearch"
      label="Saved search"
      info="The saved search whose matching traces this alert watches."
      options={savedSearches.map((search) => ({ label: search.name, value: search.id }))}
      value={value ?? undefined}
      placeholder="Select a saved search"
      searchable
      searchPlaceholder="Search saved searches…"
      searchableEmptyMessage="No saved searches found"
      loading={isLoading}
      {...(disabled ? { disabled: true } : {})}
      {...(errors ? { errors } : {})}
      onChange={(id) => onChange(id ?? null)}
    />
  )
}
