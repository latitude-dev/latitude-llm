import type { FilterSet } from "@domain/shared"
import {
  Button,
  ButtonGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  Icon,
  Text,
  toast,
} from "@repo/ui"
import { BookmarkPlusIcon, ChevronDownIcon } from "lucide-react"
import { useUpdateSavedSearch } from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { serializeFilters } from "./trace-page-state.ts"

/**
 * Save affordance inset at the search bar's right edge. The bar context makes
 * the short labels unambiguous:
 *  - hidden when there's nothing to save, and when the selected saved search is unchanged;
 *  - a primary "Save" button when content is present but no saved search is selected;
 *  - a primary "Update ⌄" group once a selected saved search has drifted — Update fires
 *    directly, the chevron offers "Save as a new search".
 *
 * The create flows ("Save"/new and "Save as a new search") are delegated to `onRequestSave`;
 * the parent owns the shared `SaveSearchModal`.
 */
export function SaveSearchSegment({
  projectId,
  query,
  filters,
  selectedSavedSearchSlug,
  loadedSavedSearch,
  onRequestSave,
}: {
  readonly projectId: string
  readonly query: string
  readonly filters: FilterSet
  /** The `?savedSearch=` slug, known before the record resolves. */
  readonly selectedSavedSearchSlug: string
  readonly loadedSavedSearch: SavedSearchRecord | null
  readonly onRequestSave: () => void
}) {
  const updateMutation = useUpdateSavedSearch(projectId)

  // A saved search is selected but its record hasn't resolved yet — render
  // nothing instead of flashing the "Save" state for unsaved content.
  if (selectedSavedSearchSlug && !loadedSavedSearch) return null

  const hasContent = query.length > 0 || Object.keys(filters).length > 0

  // Compare canonical serializations so an untouched saved search reads as "no drift".
  const hasDrift = loadedSavedSearch
    ? (loadedSavedSearch.query ?? "") !== query ||
      (serializeFilters(loadedSavedSearch.filterSet) ?? "") !== (serializeFilters(filters) ?? "")
    : false

  if (loadedSavedSearch) {
    const updateSearch = () =>
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
      )

    if (hasDrift) {
      // Update fires directly; saving the modified state as a NEW search lives
      // behind the chevron so it stays one visible click away. Our Button puts
      // its visible rounding on an inner face, so the joining classes ride on
      // `className` rather than relying on ButtonGroup's child selectors alone.
      return (
        <div className="flex h-full shrink-0 items-center pl-1 pr-2">
          <ButtonGroup>
            {/* before:hidden drops the per-button hover halo, so the joined halves read as one control. */}
            <Button
              size="sm"
              className="rounded-r-none before:hidden"
              onClick={updateSearch}
              {...(updateMutation.isPending ? { isLoading: true } : {})}
            >
              Update
            </Button>
            <DropdownMenuRoot modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-l-none border-l border-primary-foreground/25 px-1.5 before:hidden"
                  aria-label="More save options"
                >
                  <Icon icon={ChevronDownIcon} size="sm" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem className="gap-2" onSelect={onRequestSave}>
                    <Icon icon={BookmarkPlusIcon} size="sm" />
                    <Text.H5 className="flex-1">Save as a new search</Text.H5>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
          </ButtonGroup>
        </div>
      )
    }

    // In sync with the stored search — nothing to save, so no affordance at all.
    return null
  }

  if (!hasContent) return null

  return (
    <div className="flex h-full shrink-0 items-center pl-1 pr-2">
      <Button size="sm" onClick={onRequestSave}>
        Save search
      </Button>
    </div>
  )
}
