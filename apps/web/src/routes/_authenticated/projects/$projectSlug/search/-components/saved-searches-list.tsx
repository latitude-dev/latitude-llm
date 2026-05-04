import {
  Button,
  CloseTrigger,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Modal,
  optionsColumn,
  Skeleton,
  Text,
  toast,
} from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { FilterIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"
import { MemberSelector } from "../../../../../../components/member-selector.tsx"
import {
  type SavedSearchAggregates,
  useDeleteSavedSearch,
  useSavedSearchAggregates,
  useSavedSearchesList,
  useUpdateSavedSearch,
} from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { serializeFilters } from "../../-components/trace-page-state.ts"
import { SaveSearchModal } from "./save-search-modal.tsx"

const dateFormatter = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" })
const numberFormatter = new Intl.NumberFormat()

const formatDate = (iso: string): string => dateFormatter.format(new Date(iso))

const filtersCount = (filterSet: SavedSearchRecord["filterSet"]): number => Object.keys(filterSet).length

export function SavedSearchesList({
  projectId,
  projectSlug,
}: {
  readonly projectId: string
  readonly projectSlug: string
}) {
  const router = useRouter()
  const { data, isLoading } = useSavedSearchesList(projectId)
  const updateMutation = useUpdateSavedSearch(projectId)
  const [rowToRename, setRowToRename] = useState<SavedSearchRecord | null>(null)
  const [rowToDelete, setRowToDelete] = useState<SavedSearchRecord | null>(null)
  const [assignOpenForId, setAssignOpenForId] = useState<string | null>(null)

  if (!isLoading && data.length === 0) {
    return <SavedSearchesEmpty />
  }

  const columns: InfiniteTableColumn<SavedSearchRecord>[] = [
    {
      key: "name",
      header: "Saved search",
      minWidth: 280,
      render: (row) => <NameCell row={row} />,
    },
    {
      key: "lastFound",
      header: "Last found",
      width: 160,
      minWidth: 120,
      render: (row) => <LastFoundCell row={row} />,
    },
    {
      key: "assignedTo",
      header: "Assigned To",
      width: 200,
      minWidth: 160,
      ellipsis: false,
      render: (row) => (
        <AssigneeCell
          row={row}
          open={assignOpenForId === row.id}
          onOpenChange={(open) => {
            if (open) setAssignOpenForId(row.id)
            else if (assignOpenForId === row.id) setAssignOpenForId(null)
          }}
          onChange={(nextUserId) => {
            updateMutation.mutate(
              { id: row.id, assignedUserId: nextUserId },
              {
                onError: (error) => {
                  toast({
                    variant: "destructive",
                    title: "Could not update assignee",
                    description: toUserMessage(error),
                  })
                },
              },
            )
          }}
        />
      ),
    },
    {
      key: "annotated",
      header: "Annotated",
      width: 120,
      minWidth: 96,
      align: "end",
      render: (row) => <AnnotatedCell row={row} />,
    },
    {
      key: "total",
      header: "Total",
      width: 120,
      minWidth: 96,
      align: "end",
      render: (row) => <TotalCell row={row} />,
    },
    optionsColumn<SavedSearchRecord>({
      getOptions: (row) => [
        { label: "Assign to", onClick: () => setAssignOpenForId(row.id) },
        { label: "Rename", onClick: () => setRowToRename(row) },
        {
          label: "Delete",
          type: "destructive",
          onClick: () => setRowToDelete(row),
        },
      ],
    }),
  ]

  const onRowClick = (row: SavedSearchRecord) => {
    const serialized = serializeFilters(row.filterSet)
    void router.navigate({
      to: "/projects/$projectSlug/search",
      params: { projectSlug },
      search: () => {
        const next: Record<string, unknown> = { savedSearch: row.slug, q: row.query ?? "" }
        if (serialized) next.filters = serialized
        return next
      },
    })
  }

  return (
    <div className="flex min-h-0 min-w-0 grow flex-col px-6 pb-6">
      <InfiniteTable<SavedSearchRecord>
        scrollAreaLayout="intrinsic"
        className="max-h-full"
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(row) => row.id}
        onRowClick={onRowClick}
        rowInteractionRole="link"
        getRowAriaLabel={(row) => `Open saved search ${row.name}`}
        blankSlate="No saved searches yet."
      />
      {rowToRename ? (
        <SaveSearchModal
          mode="rename"
          open
          onClose={() => setRowToRename(null)}
          projectId={projectId}
          savedSearch={rowToRename}
        />
      ) : null}
      {rowToDelete ? (
        <DeleteSavedSearchModal
          row={rowToDelete}
          projectId={projectId}
          onClose={() => setRowToDelete(null)}
          onDeleted={() => void router.invalidate()}
        />
      ) : null}
    </div>
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
      title="Delete saved search"
      description={`Are you sure you want to delete "${row.name}"? This action cannot be undone.`}
      footer={
        <>
          <CloseTrigger />
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            isLoading={deleteMutation.isPending}
          >
            Delete saved search
          </Button>
        </>
      }
    />
  )
}

function SavedSearchesEmpty() {
  return (
    <div className="flex h-full w-full items-center justify-center p-8 opacity-75">
      <div className="flex max-w-lg flex-col items-center gap-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
          <Icon icon={SparklesIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>Search your traces</Text.H3>
          <Text.H5 centered color="foregroundMuted">
            Describe what you're looking for in plain language. Search blends keywords with meaning, so phrases like
            "failed payments" or "long latency on signup" work as well as exact matches.
          </Text.H5>
          <Text.H5 centered color="foregroundMuted">
            Once you've built a useful search, save it from the action bar to come back to it later.
          </Text.H5>
        </div>
      </div>
    </div>
  )
}

function NameCell({ row }: { readonly row: SavedSearchRecord }) {
  const filters = filtersCount(row.filterSet)
  const queryPreview = row.query?.trim() || null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Text.H5M ellipsis noWrap>
        {row.name}
      </Text.H5M>
      <div className="flex items-center gap-3">
        {queryPreview ? (
          <span className="flex min-w-0 items-center gap-1">
            <Icon icon={SearchIcon} size="xs" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              {queryPreview}
            </Text.H6>
          </span>
        ) : null}
        {filters > 0 ? (
          <span className="flex items-center gap-1">
            <Icon icon={FilterIcon} size="xs" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">
              {filters} {filters === 1 ? "filter" : "filters"}
            </Text.H6>
          </span>
        ) : null}
        <Text.H6 color="foregroundMuted">Saved {formatDate(row.createdAt)}</Text.H6>
      </div>
    </div>
  )
}

function AssigneeCell({
  row,
  open,
  onOpenChange,
  onChange,
}: {
  readonly row: SavedSearchRecord
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onChange: (userId: string | null) => void
}) {
  return (
    <span
      role="none"
      className="flex w-full"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <MemberSelector value={row.assignedUserId} onChange={onChange} open={open} onOpenChange={onOpenChange} />
    </span>
  )
}

function LastFoundCell({ row }: { readonly row: SavedSearchRecord }) {
  const aggregates = useSavedSearchAggregates(row)
  return <LastFoundDisplay aggregates={aggregates} />
}

function LastFoundDisplay({ aggregates }: { readonly aggregates: SavedSearchAggregates }) {
  if (aggregates.lastFoundLoading) {
    return <Skeleton className="h-4 w-20" />
  }
  if (!aggregates.lastFoundAt) {
    return <Text.H5 color="foregroundMuted">No matches</Text.H5>
  }
  return <Text.H5 color="foregroundMuted">{dateFormatter.format(aggregates.lastFoundAt)}</Text.H5>
}

function AnnotatedCell({ row }: { readonly row: SavedSearchRecord }) {
  const aggregates = useSavedSearchAggregates(row)
  return <NumberDisplay value={aggregates.annotated} loading={aggregates.annotatedLoading} />
}

function TotalCell({ row }: { readonly row: SavedSearchRecord }) {
  const aggregates = useSavedSearchAggregates(row)
  return <NumberDisplay value={aggregates.total} loading={aggregates.totalLoading} />
}

function NumberDisplay({ value, loading }: { readonly value: number | undefined; readonly loading: boolean }) {
  if (loading || value === undefined) {
    return <Skeleton className="h-4 w-10" />
  }
  return <Text.H5 color="foregroundMuted">{numberFormatter.format(value)}</Text.H5>
}
