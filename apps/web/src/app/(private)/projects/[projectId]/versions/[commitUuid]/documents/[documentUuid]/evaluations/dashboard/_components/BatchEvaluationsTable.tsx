import { EvaluationDto } from '@latitude-data/core/browser'
import {
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export default function BatchEvaluationsTable({
  evaluations,
}: {
  evaluations: EvaluationDto[]
}) {
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  return (
    <Table className='table-auto'>
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='max-h-full overflow-y-auto'>
        {evaluations.map((evaluation) => (
          <TableRow
            key={evaluation.id}
            className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border'
            onClick={() =>
              navigate.push(
                ROUTES.projects
                  .detail({ id: project.id })
                  .commits.detail({ uuid: commit.uuid })
                  .documents.detail({ uuid: document.documentUuid })
                  .evaluations.detail(evaluation.uuid).dashboard.root,
              )
            }
          >
            <TableCell>
              <Text.H4 noWrap>{evaluation.name}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4>{evaluation.description}</Text.H4>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Link
                href={
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .documents.detail({ uuid: document.documentUuid })
                    .evaluations.detail(evaluation.uuid).dashboard.destroy
                }
              >
                <Icon name='trash' />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
