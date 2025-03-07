import {
  evaluationMetadataTypes,
  evaluationResultTypes,
} from '$/app/(private)/evaluations/_components/ActiveEvaluations/Table'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import { EvaluationDto } from '@latitude-data/core/browser'
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
import { useCallback, useState } from 'react'

export default function ConnectedEvaluationsTable({
  evaluations,
  destroy,
}: {
  evaluations: EvaluationDto[]
  destroy: ReturnType<typeof useEvaluations>['destroy']
}) {
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationDto>()
  const [openDestroyModal, setOpenDestroyModal] = useState(false)
  const onDestroy = useCallback(() => {
    if (!selectedEvaluation) return
    destroy({ id: selectedEvaluation!.id })
    setOpenDestroyModal(false)
    setSelectedEvaluation(undefined)
  }, [destroy])

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
                <div className='flex items-center justify-between gap-2'>
                  <Text.H5 noWrap>{evaluation.name}</Text.H5>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ClickToCopyUuid uuid={evaluation.uuid} />
                  </div>
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
                <Text.H5>
                  {evaluationResultTypes[evaluation.resultType]}
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
                    setSelectedEvaluation(evaluation)
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedEvaluation && (
        <ConfirmModal
          dismissible
          open={openDestroyModal}
          title={`Remove ${selectedEvaluation.name} evaluation`}
          type='destructive'
          onConfirm={onDestroy}
          onCancel={() => {
            setOpenDestroyModal(false)
            setSelectedEvaluation(undefined)
          }}
          onOpenChange={(open) => {
            setOpenDestroyModal(open)
            if (!open) setSelectedEvaluation(undefined)
          }}
          confirm={{
            label: 'Remove evaluation',
            description: `Are you sure you want to delete the evaluation "${selectedEvaluation.name}"? This action cannot be undone.`,
          }}
        />
      )}
    </>
  )
}
