import {
  Button,
  CloseTrigger,
  cn,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  Icon,
  Input,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Status,
  Text,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  toast,
} from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  BellOffIcon,
  BellPlusIcon,
  BookmarkIcon,
  BookmarkPlusIcon,
  ChevronDownIcon,
  FilterIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { SeverityDots } from "../../../../../domains/alerts/severity-selector.tsx"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useSavedSearchMonitorSummaries } from "../../../../../domains/monitors/monitors.collection.ts"
import {
  useDeleteSavedSearch,
  useSavedSearchesList,
} from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { emptyAlertDraft } from "../monitors/-components/alert-form-helpers.ts"
import { MonitorCreateModal } from "../monitors/-components/monitor-create-modal.tsx"
import { SaveSearchModal } from "./save-search-modal.tsx"
import { SemanticMonitorPopoverContent, searchHasSemanticPart } from "./semantic-monitor-notice.tsx"

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

  const selected = useMemo(
    () => savedSearches.find((search) => search.slug === selectedSlug) ?? null,
    [savedSearches, selectedSlug],
  )

  // Batched per-search monitor summaries (primary slug + count + alert severities). Labels the
  // per-row "View/Create monitor" action and drives the monitored-state chip next to the trigger,
  // so it's needed while the dropdown is open OR a search is loaded.
  const monitorSummaries = useSavedSearchMonitorSummaries(projectId, {
    enabled: monitorsEnabled && (open || selected !== null),
  })

  const filtered = useMemo(() => {
    const trimmed = filter.trim().toLowerCase()
    if (!trimmed) return savedSearches
    return savedSearches.filter((search) => search.name.toLowerCase().includes(trimmed))
  }, [savedSearches, filter])

  const goToMonitor = (record: SavedSearchRecord) => {
    setOpen(false)
    const existingSlug = monitorSummaries[record.id]?.monitorSlug
    if (existingSlug) {
      void navigate({
        to: "/projects/$projectSlug/monitors/$monitorSlug",
        params: { projectSlug, monitorSlug: existingSlug },
      })
    } else {
      // Create in place on the current page; redirect to the new monitor's details on success.
      setCreateMonitorFor(record)
    }
  }

  const selectedSummary = selected ? monitorSummaries[selected.id] : undefined
  const selectedAllMuted = selectedSummary?.monitors.every((monitor) => monitor.muted) ?? false
  const selectedMutedCount = selectedSummary?.monitors.filter((monitor) => monitor.muted).length ?? 0

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
                const summary = monitorSummaries[record.id]
                const hasMonitor = Boolean(summary)
                const allMuted = hasMonitor && (summary?.monitors.every((monitor) => monitor.muted) ?? false)
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
                      !hasMonitor && searchHasSemanticPart(record.query) ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                              aria-label={`Why ${record.name} can't be monitored`}
                            >
                              <Icon icon={BellPlusIcon} size="sm" color="foregroundMuted" />
                            </Button>
                          </PopoverTrigger>
                          <SemanticMonitorPopoverContent />
                        </Popover>
                      ) : (
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
                              <Icon
                                icon={hasMonitor ? (allMuted ? BellOffIcon : BellIcon) : BellPlusIcon}
                                size="sm"
                                color="foregroundMuted"
                              />
                            </Button>
                          }
                        >
                          {hasMonitor ? (allMuted ? "View monitor (muted)" : "View monitor") : "Create monitor"}
                        </Tooltip>
                      )
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
      {monitorsEnabled && selected ? (
        selectedSummary ? (
          <DropdownMenuRoot modal={false}>
            <TooltipProvider>
              <TooltipRoot delayDuration={250}>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`View monitors for ${selected.name}`}
                      className="flex h-full shrink-0 cursor-pointer items-center gap-1.5 self-stretch border-input border-r px-2 transition-colors hover:bg-secondary/60"
                    >
                      <Icon icon={selectedAllMuted ? BellOffIcon : BellIcon} size="sm" color="foregroundMuted" />
                      <SeverityDots severities={selectedSummary.severities} />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  {selectedSummary.monitors.length} monitor
                  {selectedSummary.monitors.length === 1 ? "" : "s"}
                  {selectedMutedCount > 0
                    ? selectedMutedCount === selectedSummary.monitors.length
                      ? " · muted"
                      : ` · ${selectedMutedCount} muted`
                    : ""}
                </TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            <DropdownMenuPortal>
              <DropdownMenuContent align="start" className="w-96">
                {selectedSummary.monitors.map((monitor) => (
                  <DropdownMenuItem
                    key={monitor.slug}
                    className="cursor-pointer items-center gap-2"
                    onSelect={() =>
                      void navigate({
                        to: "/projects/$projectSlug/monitors/$monitorSlug",
                        params: { projectSlug, monitorSlug: monitor.slug },
                      })
                    }
                  >
                    <SeverityDots severities={monitor.severities} />
                    <div className="w-full min-w-0">
                      <Text.H5 ellipsis noWrap>
                        {monitor.name}
                      </Text.H5>
                    </div>
                    {monitor.muted ? <Status variant="neutral" label="Muted" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        ) : searchHasSemanticPart(selected.query) ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Why ${selected.name} can't be monitored`}
                className="flex h-full shrink-0 cursor-pointer items-center gap-1.5 self-stretch border-input border-r px-2 transition-colors hover:bg-secondary/60"
              >
                <Icon icon={BellPlusIcon} size="sm" color="foregroundMuted" />
              </button>
            </PopoverTrigger>
            <SemanticMonitorPopoverContent />
          </Popover>
        ) : (
          <Tooltip
            asChild
            trigger={
              <button
                type="button"
                aria-label={`Create a monitor for ${selected.name}`}
                className="flex h-full shrink-0 cursor-pointer items-center gap-1.5 self-stretch border-input border-r px-2 transition-colors hover:bg-secondary/60"
                onClick={() => goToMonitor(selected)}
              >
                <Icon icon={BellPlusIcon} size="sm" color="foregroundMuted" />
              </button>
            }
          >
            Create monitor
          </Tooltip>
        )
      ) : null}
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
