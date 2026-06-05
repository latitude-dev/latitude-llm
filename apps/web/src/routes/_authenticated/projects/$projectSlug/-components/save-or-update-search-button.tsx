import type { FilterSet } from "@domain/shared"
import { Button, Icon, SplitButton, Tooltip, toast } from "@repo/ui"
import { BookmarkPlusIcon, PencilIcon } from "lucide-react"
import { useUpdateSavedSearch } from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { serializeFilters } from "./trace-page-state.ts"

/**
 * Primary action at the right of the search bar:
 *  - hidden when there's nothing to save and no saved search is selected;
 *  - "Search" + bookmark-plus when content is present but no saved search is selected (saves a new one);
 *  - a split button when a saved search is selected: "Search" + pencil updates it in place (disabled
 *    while the active state matches the stored one exactly), and the always-enabled chevron offers
 *    "Save as a new search".
 *
 * The create flows ("Search"/new and "Save as a new search") are delegated to `onRequestSave`; the
 * parent owns the shared `SaveSearchModal`.
 */
export function SaveOrUpdateSearchButton({
  projectId,
  query,
  filters,
  loadedSavedSearch,
  onRequestSave,
}: {
  readonly projectId: string
  readonly query: string
  readonly filters: FilterSet
  readonly loadedSavedSearch: SavedSearchRecord | null
  readonly onRequestSave: () => void
}) {
  const updateMutation = useUpdateSavedSearch(projectId)

  const hasContent = query.length > 0 || Object.keys(filters).length > 0

  // Compare canonical serializations so an untouched saved search reads as "no drift".
  const hasDrift = loadedSavedSearch
    ? (loadedSavedSearch.query ?? "") !== query ||
      (serializeFilters(loadedSavedSearch.filterSet) ?? "") !== (serializeFilters(filters) ?? "")
    : false

  if (loadedSavedSearch) {
    return (
      <SplitButton
        variant="default"
        size="default"
        chevronAriaLabel="More save options"
        {...(updateMutation.isPending ? { isLoading: true } : {})}
        actions={[
          {
            content: "Search",
            icon: <Icon icon={PencilIcon} size="sm" />,
            tooltip: "Update search",
            // Only the primary half is locked when there's no drift; the chevron stays enabled.
            disabled: !hasDrift,
            onClick: () =>
              updateMutation.mutate(
                { id: loadedSavedSearch.id, query: query || null, filterSet: filters },
                {
                  onSuccess: () => toast({ title: "Saved search updated" }),
                  onError: (error) =>
                    toast({
                      variant: "destructive",
                      title: "Could not save changes",
                      description: toUserMessage(error),
                    }),
                },
              ),
          },
          {
            content: "Save as a new search",
            icon: <Icon icon={BookmarkPlusIcon} size="sm" />,
            onClick: onRequestSave,
          },
        ]}
      />
    )
  }

  if (!hasContent) return null

  return (
    <Tooltip
      asChild
      trigger={
        <Button variant="default" size="default" onClick={onRequestSave}>
          <Icon icon={BookmarkPlusIcon} size="sm" />
          Search
        </Button>
      }
    >
      Save search
    </Tooltip>
  )
}
