import { Container, Input, TableSkeleton, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { useDeferredValue, useState } from "react"
import { useDatasetRowsCollection, useDatasetsCollection } from "../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRowRecord } from "../../../../../domains/datasets/datasets.functions.ts"
import { DatasetTable } from "./components/dataset-table.tsx"
import { RowDetailPanel } from "./components/row-detail-panel.tsx"
import { VersionBadge } from "./components/version-badge.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectId/datasets/$datasetId")({
  component: DatasetDetailPage,
})

function DatasetDetailPage() {
  const { projectId, datasetId } = Route.useParams()
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [selectedRow, setSelectedRow] = useState<DatasetRowRecord | null>(null)
  const rowsCollection = useDatasetRowsCollection(datasetId, deferredSearch)
  const rows = rowsCollection.data
  const isLoading = !rowsCollection.data

  const datasetsCollection = useDatasetsCollection(projectId)
  const dataset = datasetsCollection.data?.find((d) => d.id === datasetId)

  return (
    <Container>
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex flex-row items-center justify-between">
          <Text.H3 weight="bold">{dataset?.name ?? "Dataset"}</Text.H3>
          {dataset?.latestVersionId && <VersionBadge versionId={dataset.latestVersionId} />}
        </div>

        <div className="flex flex-row flex-1 min-h-0 border rounded-lg overflow-hidden">
          <div className={`flex flex-col ${selectedRow ? "w-1/2" : "w-full"} min-h-0`}>
            <div className="flex flex-row items-center gap-2 px-4 py-3 border-b">
              <Input
                type="text"
                placeholder="Search rows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <TableSkeleton cols={4} rows={8} />
              ) : rows.length > 0 ? (
                <DatasetTable rows={rows} selectedRowId={selectedRow?.rowId ?? null} onSelectRow={setSelectedRow} />
              ) : (
                <div className="flex items-center justify-center p-8">
                  <Text.H5 color="foregroundMuted">No rows found</Text.H5>
                </div>
              )}
            </div>
          </div>

          {selectedRow && (
            <div className="w-1/2 min-h-0">
              <RowDetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
            </div>
          )}
        </div>
      </div>
    </Container>
  )
}
