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
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  BellPlusIcon,
  BookmarkPlusIcon,
  ChevronDownIcon,
  FilterIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useSavedSearchMonitorSlugs } from "../../../../../domains/monitors/monitors.collection.ts"
import {
  useDeleteSavedSearch,
  useSavedSearchesList,
} from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { emptyAlertDraft } from "../monitors/-components/alert-form-helpers.ts"
import { MonitorCreateModal } from "../monitors/-components/monitor-create-modal.tsx"
import { SaveSearchModal } from "./save-search-modal.tsx"

/**
 * Dropdown listing the project's saved searches with a filter, per-row delete and
 * "Create/Edit monitor" entry-points, and a "Save current search…" footer. Selecting a
 * row applies its query + filters to the active page via `onSelect`.
 */
export function SavedSearchSelector({
  projectId,
  projectSlug,
  selectedSlug,
  onSelect,
  onSelectedSlugChange,
  onSaveCurrent,
  canSaveCurrent,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly selectedSlug: string
  readonly onSelect: (record: SavedSearchRecord) => void
  /** Re-point (or clear with `""`) the selected `savedSearch` slug — used when the selected search is deleted or renamed. */
  readonly onSelectedSlugChange: (slug: string) => void
  readonly onSaveCurrent: () => void
  readonly canSaveCurrent: boolean
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const [rowToDelete, setRowToDelete] = useState<SavedSearchRecord | null>(null)
  const [rowToRename, setRowToRename] = useState<SavedSearchRecord | null>(null)
  const [createMonitorFor, setCreateMonitorFor] = useState<SavedSearchRecord | null>(null)

  // Monitors are flag-gated; with the flag off we hide the per-row monitor affordance entirely
  // (the monitors page would just show its "not available" splash) and skip the lookup.
  const monitorsEnabled = useHasFeatureFlag("monitors")

  const { data: savedSearches } = useSavedSearchesList(projectId)
  // Batched `savedSearchId -> monitorSlug` map (earliest-created live, unmuted monitor per search),
  // used to label the per-row action "View monitor" vs "Create monitor". Fetched only while open.
  const monitorSlugBySavedSearchId = useSavedSearchMonitorSlugs(projectId, { enabled: open && monitorsEnabled })

  const selected = useMemo(
    () => savedSearches.find((search) => search.slug === selectedSlug) ?? null,
    [savedSearches, selectedSlug],
  )

  const filtered = useMemo(() => {
    const trimmed = filter.trim().toLowerCase()
    if (!trimmed) return savedSearches
    return savedSearches.filter((search) => search.name.toLowerCase().includes(trimmed))
  }, [savedSearches, filter])

  const goToMonitor = (record: SavedSearchRecord) => {
    setOpen(false)
    const existingSlug = monitorSlugBySavedSearchId[record.id]
    if (existingSlug) {
      void navigate({
        to: "/projects/$projectSlug/monitors",
        params: { projectSlug },
        search: { monitorSlug: existingSlug },
      })
    } else {
      // Create in place on the current page; redirect to the new monitor's details on success.
      setCreateMonitorFor(record)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Saved searches"
            className="flex h-full shrink-0 cursor-pointer items-center gap-1 self-stretch border-r border-input bg-secondary px-2 text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {selected ? <span className="max-w-40 truncate text-sm">{selected.name}</span> : null}
            <Icon icon={ChevronDownIcon} size="sm" color="foregroundMuted" />
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
                const hasMonitor = Boolean(monitorSlugBySavedSearchId[record.id])
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
                    {monitorsEnabled ? (
                      <Tooltip
                        asChild
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                            aria-label={
                              hasMonitor ? `View monitor for ${record.name}` : `Create monitor for ${record.name}`
                            }
                            onClick={() => goToMonitor(record)}
                          >
                            <Icon icon={hasMonitor ? BellIcon : BellPlusIcon} size="sm" color="foregroundMuted" />
                          </Button>
                        }
                      >
                        {hasMonitor ? "View monitor" : "Create monitor"}
                      </Tooltip>
                    ) : null}
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
      {createMonitorFor ? (
        <MonitorCreateModal
          projectId={projectId}
          projectSlug={projectSlug}
          initialAlert={emptyAlertDraft({ sourceId: createMonitorFor.id })}
          onClose={() => setCreateMonitorFor(null)}
          onCreated={(slug) => {
            void navigate({
              to: "/projects/$projectSlug/monitors",
              params: { projectSlug },
              search: { monitorSlug: slug },
            })
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
        toast({ variant: "destructive", title: "Could not delete", description: toUserMessage(error) })
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
