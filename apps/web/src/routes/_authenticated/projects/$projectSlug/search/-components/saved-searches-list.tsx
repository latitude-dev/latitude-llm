import { DropdownMenu, Icon, Skeleton, Text, toast } from "@repo/ui"
import { Link, useRouter } from "@tanstack/react-router"
import { BookmarkIcon, FilterIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"
import {
  useDeleteSavedSearch,
  useSavedSearchesList,
} from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { serializeFilters } from "../../-components/trace-page-state.ts"
import { SaveSearchModal } from "./save-search-modal.tsx"

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })

const filtersCount = (filterSet: SavedSearchRecord["filterSet"]): number => Object.keys(filterSet).length

export function SavedSearchesList({
  projectId,
  projectSlug,
}: {
  readonly projectId: string
  readonly projectSlug: string
}) {
  const { data, isLoading } = useSavedSearchesList(projectId)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-6 py-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  if (data.length === 0) {
    return <SavedSearchesEmpty />
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-3">
        <Icon icon={BookmarkIcon} size="sm" color="foregroundMuted" />
        <Text.H5M color="foregroundMuted">Saved searches</Text.H5M>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {data.map((row) => (
          <SavedSearchRow key={row.id} projectId={projectId} projectSlug={projectSlug} row={row} />
        ))}
      </ul>
    </div>
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

function SavedSearchRow({
  projectId,
  projectSlug,
  row,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly row: SavedSearchRecord
}) {
  const router = useRouter()
  const deleteMutation = useDeleteSavedSearch(projectId)
  const [renameOpen, setRenameOpen] = useState(false)

  const filters = filtersCount(row.filterSet)
  const queryPreview = row.query?.trim() || null
  const serialized = serializeFilters(row.filterSet)

  return (
    <li className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40">
      <Link
        to="/projects/$projectSlug/search"
        params={{ projectSlug }}
        search={(prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = {
            ...prev,
            savedSearch: row.slug,
            q: row.query ?? "",
          }
          if (serialized) next.filters = serialized
          else delete next.filters
          return next
        }}
        className="flex min-w-0 flex-1 flex-col gap-1"
      >
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
      </Link>
      <div className="shrink-0">
        <DropdownMenu
          align="end"
          triggerButtonProps={{
            variant: "ghost",
            "aria-label": `Actions for saved search ${row.name}`,
          }}
          options={[
            { label: "Rename", onClick: () => setRenameOpen(true) },
            {
              label: "Delete",
              type: "destructive" as const,
              onClick: () => {
                deleteMutation.mutate(row.id, {
                  onSuccess: () => {
                    toast({ title: "Saved search deleted" })
                    void router.invalidate()
                  },
                  onError: (error) => {
                    toast({ variant: "destructive", title: "Could not delete", description: toUserMessage(error) })
                  },
                })
              },
            },
          ]}
        />
      </div>
      {renameOpen ? (
        <SaveSearchModal
          mode="rename"
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          projectId={projectId}
          savedSearch={row}
        />
      ) : null}
    </li>
  )
}
