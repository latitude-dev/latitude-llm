import {
  evaluationMetadataTypes,
  evaluationResultTypes,
} from '$/app/(private)/evaluations/_components/ActiveEvaluations/Table'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  getEvaluationMetricSpecification,
  getEvaluationTypeSpecification,
} from '$/components/evaluations'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationDto,
  EvaluationTmp,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/browser'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
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

  const { enabled: experimentsEnabled } = useFeatureFlag({
    featureFlag: 'experiments',
  })

  const rows = useMemo<EvaluationTmp[]>(() => {
    return [
      ...evaluations.map((evaluation) => ({
        ...evaluation,
        version: 'v1' as const,
      })),
      ...evaluationsV2
        .filter((evaluation) => {
          if (experimentsEnabled) {
            return (
              evaluation.type === EvaluationType.Rule ||
              evaluation.type === EvaluationType.Llm
            )
          }
          return evaluation.type === EvaluationType.Rule
        })
        .map((evaluation) => ({
          ...evaluation,
          version: 'v2' as const,
        })),
    ]
  }, [evaluations, evaluationsV2, experimentsEnabled])

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
            <TableHead>Metric</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody className='max-h-full overflow-y-auto'>
          {rows.map((row) => (
            <TableRow
              key={row.uuid}
              className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border'
              onClick={() => {
                if (row.version === 'v2') {
                  navigate.push(
                    ROUTES.projects
                      .detail({ id: project.id })
                      .commits.detail({ uuid: commit.uuid })
                      .documents.detail({ uuid: document.documentUuid })
                      .evaluationsV2.detail({ uuid: row.uuid }).root,
                  )
                  return
                }

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
                <Text.H5 noWrap ellipsis>
                  {row.name}
                </Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>{row.description || '-'}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>
                  {row.version === 'v2'
                    ? getEvaluationTypeSpecification(row).name
                    : evaluationMetadataTypes[row.metadataType]}
                </Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>
                  {row.version === 'v2'
                    ? getEvaluationMetricSpecification(row).name
                    : evaluationResultTypes[row.resultType]}
                </Text.H5>
              </TableCell>
              <TableCell>
                <DropdownMenu
                  options={[
                    {
                      label: 'Remove',
                      onElementClick: (e) => e.stopPropagation(),
                      onClick: () => {
                        setOpenDestroyModal(true)
                        setSelectedRow(row)
                      },
                      type: 'destructive',
                    },
                  ]}
                  side='bottom'
                  align='end'
                  triggerButtonProps={{
                    className: 'border-none justify-end cursor-pointer',
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
