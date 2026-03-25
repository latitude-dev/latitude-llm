import { generateId } from "@domain/shared"
import {
  Button,
  DatabaseAddIcon,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  sortDirectionSchema,
  Tooltip,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo, useState } from "react"
import { z } from "zod"
import { useDatasetsInfiniteScroll } from "../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRecord } from "../../../../../domains/datasets/datasets.functions.ts"
import { createDatasetIntentMutation } from "../../../../../domains/datasets/datasets.mutations.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"

const DATASET_LIST_SORT_COLUMNS = ["name", "updatedAt"] as const
const datasetsListSearchSchema = z.object({
  sortBy: z.enum(DATASET_LIST_SORT_COLUMNS).optional(),
  sortDirection: sortDirectionSchema,
})

export const Route = createFileRoute("/_authenticated/projects/$projectId/datasets/")({
  component: DatasetsPage,
  validateSearch: (search: Record<string, unknown>) => {
    const parsed = datasetsListSearchSchema.safeParse(search)
    if (!parsed.success) return {}
    return parsed.data
  },
})

const DEFAULT_SORTING: InfiniteTableSorting = {
  column: "updatedAt",
  direction: "desc",
}

const columns: InfiniteTableColumn<DatasetRecord>[] = [
  {
    key: "name",
    header: "Name",
    sortKey: "name",
    render: (d) => d.name,
  },
  {
    key: "description",
    header: "Description",
    render: (d) => d.description ?? "—",
  },
  {
    key: "updatedAt",
    header: "Last updated",
    sortKey: "updatedAt",
    render: (d) => (
      <Tooltip trigger={relativeTime(new Date(d.updatedAt))}>{new Date(d.updatedAt).toLocaleString()}</Tooltip>
    ),
  },
]

function DatasetsPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)

  const sorting: InfiniteTableSorting = useMemo(
    () => ({
      column: search.sortBy ?? DEFAULT_SORTING.column,
      direction: search.sortDirection ?? DEFAULT_SORTING.direction,
    }),
    [search.sortBy, search.sortDirection],
  )

  const handleSortChange = useCallback(
    (next: InfiniteTableSorting) => {
      navigate({
        params: { projectId },
        search: {
          sortBy: next.column,
          sortDirection: next.direction,
        },
      })
    },
    [navigate, projectId],
  )

  const {
    data: datasets,
    isLoading,
    infiniteScroll,
  } = useDatasetsInfiniteScroll({
    projectId,
    sorting,
  })

  const getRowKey = useCallback((d: DatasetRecord) => d.id, [])
  const onRowClick = useCallback(
    (d: DatasetRecord) =>
      navigate({
        to: "/projects/$projectId/datasets/$datasetId",
        params: { projectId, datasetId: d.id },
      }),
    [navigate, projectId],
  )

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const datasetId = generateId()
      const transaction = createDatasetIntentMutation({
        id: datasetId,
        projectId,
        name: `Dataset ${new Date().toLocaleString()}`,
      })
      await transaction.isPersisted.promise
      navigate({
        to: "/projects/$projectId/datasets/$datasetId",
        params: { projectId, datasetId },
      })
    } catch (err) {
      toast({ variant: "destructive", description: toUserMessage(err) })
    } finally {
      setCreating(false)
    }
  }, [projectId, navigate, toast])

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem />
            <Layout.ActionRowItem>
              <Button flat variant="outline" onClick={handleCreate} disabled={creating} isLoading={creating}>
                <Icon size="sm" icon={DatabaseAddIcon} />
                Dataset
              </Button>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <Layout.List>
          <InfiniteTable
            data={datasets}
            isLoading={isLoading}
            columns={columns}
            getRowKey={getRowKey}
            onRowClick={onRowClick}
            infiniteScroll={infiniteScroll}
            sorting={sorting}
            defaultSorting={DEFAULT_SORTING}
            onSortChange={handleSortChange}
            blankSlate="There are no datasets yet."
          />
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
