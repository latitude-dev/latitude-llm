import {
  evaluationMetadataTypes,
  evaluationResultTypes,
} from '$/app/(private)/evaluations/_components/ActiveEvaluations/Table'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import useEvaluationsV2 from '$/stores/evaluationsV2'
import {
  EvaluationDto,
  EvaluationTmp,
  EvaluationV2,
  RuleEvaluationSpecification,
} from '@latitude-data/core/browser'
import {
  Button,
  ClickToCopyUuid,
  ConfirmModal,
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
import { useMemo, useState } from 'react'

export default function ConnectedEvaluationsTable({
  evaluations,
  evaluationsV2,
  deleteEvaluation,
  deleteEvaluationV2,
}: {
  evaluations: EvaluationDto[]
  evaluationsV2: EvaluationV2[]
  deleteEvaluation: ReturnType<typeof useEvaluations>['destroy']
  deleteEvaluationV2: ReturnType<typeof useEvaluationsV2>['deleteEvaluation']
}) {
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const rows = useMemo<EvaluationTmp[]>(() => {
    return [
      ...evaluations.map((evaluation) => ({
        ...evaluation,
        version: 'v1' as const,
      })),
      ...evaluationsV2.map((evaluation) => ({
        ...evaluation,
        version: 'v2' as const,
      })),
    ]
  }, [evaluations, evaluationsV2])

  const [selectedRow, setSelectedRow] = useState<EvaluationTmp>()
  const [openDestroyModal, setOpenDestroyModal] = useState(false)

  return (
    <>
      <Table className='table-auto'>
        <TableHeader className='sticky top-0 z-10'>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Result Type</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className='max-h-full overflow-y-auto'>
          {rows.map((row) => (
            <TableRow
              key={row.uuid}
              className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border'
              onClick={() => {
                if (row.version !== 'v1') return
                navigate.push(
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .documents.detail({ uuid: document.documentUuid })
                    .evaluations.detail(row.id).root,
                )
              }}
            >
              <TableCell>
                <div className='flex items-center justify-between gap-2 truncate'>
                  <Text.H5 noWrap ellipsis>
                    {row.name}
                  </Text.H5>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ClickToCopyUuid uuid={row.uuid} />
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Text.H5>{row.description || '-'}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>
                  {row.version === 'v2'
                    ? RuleEvaluationSpecification.name
                    : evaluationMetadataTypes[row.metadataType]}
                </Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>
                  {row.version === 'v2'
                    ? evaluationResultTypes['evaluation_resultable_numbers']
                    : evaluationResultTypes[row.resultType]}
                </Text.H5>
              </TableCell>
              <TableCell>
                <Button
                  variant='ghost'
                  size='icon'
                  iconProps={{ name: 'trash' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenDestroyModal(true)
                    setSelectedRow(row)
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedRow && (
        <ConfirmModal
          dismissible
          open={openDestroyModal}
          title={`Remove ${selectedRow.name} evaluation`}
          type='destructive'
          onConfirm={() => {
            if (selectedRow.version === 'v2') {
              deleteEvaluationV2({
                evaluationUuid: selectedRow.uuid,
              })
            } else {
              deleteEvaluation({ id: selectedRow.id })
            }
            setOpenDestroyModal(false)
            setSelectedRow(undefined)
          }}
          onCancel={() => {
            setOpenDestroyModal(false)
            setSelectedRow(undefined)
          }}
          onOpenChange={(open) => {
            setOpenDestroyModal(open)
            if (!open) setSelectedRow(undefined)
          }}
          confirm={{
            label: 'Remove evaluation',
            description: `Are you sure you want to delete the evaluation "${selectedRow.name}"? This action cannot be undone.`,
          }}
        />
      )}
    </>
  )
}
