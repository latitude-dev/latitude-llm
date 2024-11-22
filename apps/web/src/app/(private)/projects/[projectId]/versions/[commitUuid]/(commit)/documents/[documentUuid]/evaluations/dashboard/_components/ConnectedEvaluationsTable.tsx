import { EvaluationDto } from '@latitude-data/core/browser'
import {
  ClickToCopyUuid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import {
  evaluationMetadataTypes,
  evaluationResultTypes,
} from '$/app/(private)/evaluations/_components/ActiveEvaluations/Table'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

export default function ConnectedEvaluationsTable({
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
          <TableHead>Type</TableHead>
          <TableHead>Result Type</TableHead>
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
                  .evaluations.detail(evaluation.id).root,
              )
            }
          >
            <TableCell>
              <Text.H5 noWrap>{evaluation.name}</Text.H5>
              <div onClick={(e) => e.stopPropagation()}>
                <ClickToCopyUuid uuid={evaluation.uuid} />
              </div>
            </TableCell>
            <TableCell>
              <Text.H5>{evaluation.description || '-'}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5>
                {evaluationMetadataTypes[evaluation.metadataType]}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5>{evaluationResultTypes[evaluation.resultType]}</Text.H5>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
