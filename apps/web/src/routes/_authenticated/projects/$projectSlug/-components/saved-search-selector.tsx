import {
  Button,
  CloseTrigger,
  cn,
  Icon,
  Input,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
  Tooltip,
  toast,
} from "@repo/ui"
import {
  BookmarkIcon,
  BookmarkPlusIcon,
  ChevronDownIcon,
  FilterIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"
import {
  useDeleteSavedSearch,
  useSavedSearchesList,
} from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { SaveSearchModal } from "./save-search-modal.tsx"

/**
 * Dropdown listing the project's saved searches with a filter, per-row actions,
 * and a "Save current search…" footer. Selecting a row applies its query + filters
 * to the active page via `onSelect`.
 */
export function SavedSearchSelector({
  projectId,
  selectedSlug,
  onSelect,
  onSelectedSlugChange,
  onSaveCurrent,
  canSaveCurrent,
}: {
  readonly projectId: string
  readonly selectedSlug: string
  readonly onSelect: (record: SavedSearchRecord) => void
  /** Re-point (or clear with `""`) the selected `savedSearch` slug — used when the selected search is deleted or renamed. */
  readonly onSelectedSlugChange: (slug: string) => void
  readonly onSaveCurrent: () => void
  readonly canSaveCurrent: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const [rowToDelete, setRowToDelete] = useState<SavedSearchRecord | null>(null)
  const [rowToRename, setRowToRename] = useState<SavedSearchRecord | null>(null)

  const { data: savedSearches } = useSavedSearchesList(projectId)

  const selected = useMemo(
    () => savedSearches.find((search) => search.slug === selectedSlug) ?? null,
    [savedSearches, selectedSlug],
  )

  const filtered = useMemo(() => {
    const trimmed = filter.trim().toLowerCase()
    if (!trimmed) return savedSearches
    return savedSearches.filter((search) => search.name.toLowerCase().includes(trimmed))
  }, [savedSearches, filter])

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Saved searches"
            // pl-3 ≈ pr-2 + the chevron glyph's ~4px empty right inset, so both sides read even.
            className="flex h-full min-w-0 cursor-pointer items-center gap-1 self-stretch border-r border-input bg-secondary pl-3 pr-2 text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {selected ? (
              <span className="min-w-0 max-w-40 truncate text-sm">{selected.name}</span>
            ) : (
              <>
                <Icon icon={BookmarkIcon} size="sm" color="foregroundMuted" className="shrink-0" />
                <span className="text-muted-foreground text-sm">Searches</span>
              </>
            )}
            <Icon icon={ChevronDownIcon} size="sm" color="foregroundMuted" className="shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-80 p-0">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Find saved searches…"
                size="sm"
                className="pl-8"
              />
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <Text.H6 color="foregroundMuted">
                  {savedSearches.length === 0 ? "No saved searches yet." : "No matches."}
                </Text.H6>
              </div>
            ) : (
              filtered.map((record) => {
                const isSelected = record.slug === selectedSlug
                const filtersCount = Object.keys(record.filterSet).length
                return (
                  <div
                    key={record.id}
                    className={cn(
                      "group/row flex items-center gap-1 rounded-md pr-1",
                      isSelected ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left outline-none"
                      onClick={() => {
                        onSelect(record)
                        setOpen(false)
                      }}
                    >
                      <Text.H5M ellipsis noWrap>
                        {record.name}
                      </Text.H5M>
                      <span className="flex min-w-0 items-center gap-2">
                        {record.query ? (
                          <span className="flex min-w-0 items-center gap-1">
                            <Icon icon={SearchIcon} size="xs" color="foregroundMuted" className="shrink-0" />
                            <Text.H6 color="foregroundMuted" ellipsis noWrap>
                              {record.query}
                            </Text.H6>
                          </span>
                        ) : null}
                        {filtersCount > 0 ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <Icon icon={FilterIcon} size="xs" color="foregroundMuted" className="shrink-0" />
                            <Text.H6 color="foregroundMuted" noWrap>
                              {filtersCount} {filtersCount === 1 ? "filter" : "filters"}
                            </Text.H6>
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <Tooltip
                      asChild
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                          aria-label={`Rename saved search ${record.name}`}
                          onClick={() => setRowToRename(record)}
                        >
                          <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
                        </Button>
                      }
                    >
                      Rename
                    </Tooltip>
                    <Tooltip
                      asChild
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                          aria-label={`Delete saved search ${record.name}`}
                          onClick={() => setRowToDelete(record)}
                        >
                          <Icon icon={Trash2Icon} size="sm" color="destructive" />
                        </Button>
                      }
                    >
                      Remove
                    </Tooltip>
                  </div>
                )
              })
            )}
          </div>
          <div className="border-t border-border p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={!canSaveCurrent}
              onClick={() => {
                setOpen(false)
                onSaveCurrent()
              }}
            >
              <Icon icon={BookmarkPlusIcon} size="sm" />
              Save current search
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {rowToDelete ? (
        <DeleteSavedSearchModal
          row={rowToDelete}
          projectId={projectId}
          onClose={() => setRowToDelete(null)}
          onDeleted={() => {
            if (rowToDelete.slug === selectedSlug) onSelectedSlugChange("")
          }}
        />
      ) : null}
      {rowToRename ? (
        <SaveSearchModal
          mode="rename"
          open
          onClose={() => setRowToRename(null)}
          projectId={projectId}
          savedSearch={rowToRename}
          onRenamed={(updated) => {
            // Renaming changes the slug; re-point the URL param if the renamed search is selected.
            if (rowToRename.slug === selectedSlug) onSelectedSlugChange(updated.slug)
          }}
        />
      ) : null}
    </>
  )
}

function DeleteSavedSearchModal({
  row,
  projectId,
  onClose,
  onDeleted,
}: {
  readonly row: SavedSearchRecord
  readonly projectId: string
  readonly onClose: () => void
  readonly onDeleted: () => void
}) {
  const deleteMutation = useDeleteSavedSearch(projectId)

  const handleDelete = () => {
    deleteMutation.mutate(row.id, {
      onSuccess: () => {
        toast({ title: "Saved search deleted" })
        onDeleted()
        onClose()
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Could not delete",
          description: toUserMessage(error),
        })
      },
    })
  }

  return (
    <Modal
      open
      dismissible
      onOpenChange={onClose}
      title="Remove saved search"
      description="Removing this saved search cannot be undone. Alerts monitoring this search will be deleted"
      footer={
        <>
          <CloseTrigger />
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            isLoading={deleteMutation.isPending}
          >
            Remove
          </Button>
        </>
      }
    />
  )
}
