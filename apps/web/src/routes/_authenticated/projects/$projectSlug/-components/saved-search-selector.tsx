import { stripCustomBehaviorExcludedFields } from "@domain/taxonomy"
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
  BellPlusIcon,
  BookmarkIcon,
  BookmarkPlusIcon,
  ChevronDownIcon,
  FilterIcon,
  FlaskConicalIcon,
  PencilIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useCreateExperimentFromSearch } from "../../../../../domains/experiments/experiments.collection.ts"
import { useFeatureFlags } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { savedSearchMonitorTarget } from "../../../../../domains/monitors/monitor-target.ts"
import {
  useDeleteSavedSearch,
  useSavedSearchesList,
} from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { targetAlertDraft } from "../monitors/-components/alert-form-helpers.ts"
import { MonitorCreateModal } from "../monitors/-components/monitor-create-modal.tsx"
import { SaveSearchModal } from "./save-search-modal.tsx"
import { serializeFilters } from "./trace-page-state.ts"

/**
 * Dropdown listing the project's saved searches with a filter, per-row actions,
 * and a "Save current search…" footer. Selecting a row applies its query + filters
 * to the active page via `onSelect`.
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
  const featureFlags = useFeatureFlags()
  const customBehaviorsEnabled = featureFlags.has("customBehaviors")
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const [rowToDelete, setRowToDelete] = useState<SavedSearchRecord | null>(null)
  const [rowToRename, setRowToRename] = useState<SavedSearchRecord | null>(null)
  const [rowToMonitor, setRowToMonitor] = useState<SavedSearchRecord | null>(null)
  const [rowToCompare, setRowToCompare] = useState<SavedSearchRecord | null>(null)

  const { data: savedSearches } = useSavedSearchesList(projectId)

  // Per spec, a custom behavior seeded from a saved search copies its filterSet
  // only (never the semantic query), with the excluded `topics` field stripped.
  const createCustomBehaviorFromSavedSearch = (record: SavedSearchRecord) => {
    const seed = stripCustomBehaviorExcludedFields(record.filterSet)
    setOpen(false)
    navigate({
      to: "/projects/$projectSlug/behaviours/new",
      params: { projectSlug },
      search: { filters: serializeFilters(seed) },
    })
  }

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
                      "group/row relative flex items-center rounded-md",
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
                    {/* Actions sit in a panel overlaid on the row's right edge, revealed on hover/focus:
                        a solid `bg-accent` strip holds the buttons, and a gradient to its left fades the
                        item's name/subtitle out underneath them. `pointer-events-none` while hidden lets
                        clicks fall through to the Select button behind it. */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                      <div aria-hidden className="h-full w-10 bg-gradient-to-l from-accent to-transparent" />
                      <div className="flex h-full items-center gap-0.5 rounded-r-md bg-accent pr-1">
                        {customBehaviorsEnabled &&
                        Object.keys(stripCustomBehaviorExcludedFields(record.filterSet)).length > 0 ? (
                          <Tooltip
                            asChild
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Create a custom behavior from saved search ${record.name}`}
                                onClick={() => createCustomBehaviorFromSavedSearch(record)}
                              >
                                <Icon icon={SlidersHorizontalIcon} size="sm" color="foregroundMuted" />
                              </Button>
                            }
                          >
                            Create custom behavior
                          </Tooltip>
                        ) : null}
                        <Tooltip
                          asChild
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Create a monitor from ${record.name}`}
                              onClick={() => setRowToMonitor(record)}
                            >
                              <Icon icon={BellPlusIcon} size="sm" color="foregroundMuted" />
                            </Button>
                          }
                        >
                          Monitor
                        </Tooltip>
                        <Tooltip
                          asChild
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Create an experiment from ${record.name}`}
                              onClick={() => setRowToCompare(record)}
                            >
                              <Icon icon={FlaskConicalIcon} size="sm" color="foregroundMuted" />
                            </Button>
                          }
                        >
                          Compare
                        </Tooltip>
                        <Tooltip
                          asChild
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
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
                    </div>
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
      {rowToMonitor ? (
        <MonitorCreateModal
          projectId={projectId}
          projectSlug={projectSlug}
          initialAlert={targetAlertDraft(savedSearchMonitorTarget(rowToMonitor.id))}
          onClose={() => setRowToMonitor(null)}
        />
      ) : null}
      {rowToCompare ? (
        <CompareSavedSearchModal
          row={rowToCompare}
          projectId={projectId}
          projectSlug={projectSlug}
          onClose={() => setRowToCompare(null)}
          onCreated={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

function CompareSavedSearchModal({
  row,
  projectId,
  projectSlug,
  onClose,
  onCreated,
}: {
  readonly row: SavedSearchRecord
  readonly projectId: string
  readonly projectSlug: string
  readonly onClose: () => void
  readonly onCreated: () => void
}) {
  const navigate = useNavigate()
  const createExperiment = useCreateExperimentFromSearch(projectId)

  const handleCreate = async () => {
    try {
      const experiment = await createExperiment.mutateAsync({
        name: row.name,
        filterSet: row.filterSet,
        query: row.query,
      })
      onCreated()
      onClose()
      void navigate({
        to: "/projects/$projectSlug/experiments/$experimentSlug",
        params: { projectSlug, experimentSlug: experiment.slug },
      })
    } catch (error) {
      toast({ variant: "destructive", title: "Could not create experiment", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open
      dismissible
      onOpenChange={onClose}
      title="Create experiment from search"
      description="The search's filters and query will be imported into a new experiment variant as the baseline."
      footer={
        <>
          <CloseTrigger />
          <Button
            onClick={() => void handleCreate()}
            disabled={createExperiment.isPending}
            isLoading={createExperiment.isPending}
          >
            Create experiment
          </Button>
        </>
      }
    />
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
