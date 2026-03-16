import {
  Button,
  Container,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  TableWithHeader,
  Text,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { useDatasetsCollection } from "../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRecord } from "../../../../../domains/datasets/datasets.functions.ts"
import { createDatasetMutation } from "../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId/datasets/")({
  component: DatasetsPage,
})

function DatasetsTable({ datasets, projectId }: { datasets: DatasetRecord[]; projectId: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {datasets.map((dataset) => (
          <TableRow key={dataset.id} verticalPadding className="cursor-pointer">
            <TableCell>
              <Link
                to="/projects/$projectId/datasets/$datasetId"
                params={{ projectId, datasetId: dataset.id }}
                className="contents"
              >
                <Text.H5>{dataset.name}</Text.H5>
              </Link>
            </TableCell>
            <TableCell>
              <Link
                to="/projects/$projectId/datasets/$datasetId"
                params={{ projectId, datasetId: dataset.id }}
                className="contents"
              >
                <Text.H5 color="foregroundMuted">{dataset.currentVersion}</Text.H5>
              </Link>
            </TableCell>
            <TableCell>
              <Link
                to="/projects/$projectId/datasets/$datasetId"
                params={{ projectId, datasetId: dataset.id }}
                className="contents"
              >
                <Text.H5 color="foregroundMuted">{relativeTime(dataset.createdAt)}</Text.H5>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function DatasetsPage() {
  const { projectId } = Route.useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const datasetsCollection = useDatasetsCollection(projectId)
  const datasets = datasetsCollection.data ?? []
  const isLoading = !datasetsCollection.data
  const [creating, setCreating] = useState(false)
  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const dataset = await createDatasetMutation({
        data: { projectId, name: `Dataset ${new Date().toLocaleString()}` },
      })
      getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
      navigate({
        to: "/projects/$projectId/datasets/$datasetId",
        params: { projectId, datasetId: dataset.id },
      })
    } catch (err) {
      toast({ variant: "destructive", description: toUserMessage(err) })
    } finally {
      setCreating(false)
    }
  }, [projectId, navigate, toast])

  return (
    <Container className="pt-14">
      <TableWithHeader
        title="Datasets"
        actions={
          <Button variant="outline" onClick={handleCreate} disabled={creating} isLoading={creating}>
            + Dataset
          </Button>
        }
        table={
          isLoading ? (
            <TableSkeleton cols={3} rows={3} />
          ) : datasets.length > 0 ? (
            <DatasetsTable datasets={datasets} projectId={projectId} />
          ) : (
            <TableBlankSlate description="There are no datasets yet." />
          )
        }
      />
    </Container>
  )
}
