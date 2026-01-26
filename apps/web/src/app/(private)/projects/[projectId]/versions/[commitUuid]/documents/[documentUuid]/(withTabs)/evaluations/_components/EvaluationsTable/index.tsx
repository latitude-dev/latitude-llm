import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { EvaluationType, EvaluationV2 } from '@latitude-data/core/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useMemo, useState } from 'react'
import { EvaluationTableItem } from './Item'
import { EvaluationsTableBlankSlate } from './BlankSlate'

function groupEvaluationsByType(evaluations: EvaluationV2[]) {
  const grouped = evaluations
    .filter((e) => !e.ignoredAt)
    .reduce(
      (acc, evaluation) => {
        if (!acc[evaluation.type]) {
          acc[evaluation.type] = []
        }
        acc[evaluation.type].push(evaluation)
        return acc
      },
      {} as Record<EvaluationType, EvaluationV2[]>,
    )
  return grouped
}

export function EvaluationsTable({
  evaluations,
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
  generateEvaluation,
  generatorEnabled,
  isLoading,
  isCreatingEvaluation,
  isUpdatingEvaluation,
  isDeletingEvaluation,
  isGeneratingEvaluation,
}: {
  evaluations: EvaluationV2[]
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  updateEvaluation: ReturnType<typeof useEvaluationsV2>['updateEvaluation']
  deleteEvaluation: ReturnType<typeof useEvaluationsV2>['deleteEvaluation']
  generateEvaluation: ReturnType<typeof useEvaluationsV2>['generateEvaluation']
  generatorEnabled: boolean
  isLoading?: boolean
  isCreatingEvaluation: boolean
  isUpdatingEvaluation: boolean
  isDeletingEvaluation: boolean
  isGeneratingEvaluation: boolean
}) {
  const { document } = useCurrentDocument()

  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationV2>()
  const annotationsEvaluation = useMemo(() => {
    return evaluations.find(
      (e) =>
        e.type === EvaluationType.Human &&
        !!(e as EvaluationV2<EvaluationType.Human>).configuration
          .enableControls,
    ) as EvaluationV2<EvaluationType.Human> | undefined
  }, [evaluations])

  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const onDelete = useCallback(
    async (evaluation: EvaluationV2) => {
      if (isDeletingEvaluation) return
      const [_, errors] = await deleteEvaluation({
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
      })
      if (errors) return
      setOpenDeleteModal(false)
    },
    [
      isDeletingEvaluation,
      deleteEvaluation,
      setOpenDeleteModal,
      document.documentUuid,
    ],
  )

  const onUnuseAnnotations = useCallback(
    async (evaluation: EvaluationV2<EvaluationType.Human>) => {
      if (evaluation.uuid !== annotationsEvaluation?.uuid) return
      if (isUpdatingEvaluation) return
      return await updateEvaluation({
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
        settings: {
          configuration: { ...evaluation.configuration, enableControls: false },
        },
      })
    },
    [document, isUpdatingEvaluation, updateEvaluation, annotationsEvaluation],
  )

  const onUseAnnotations = useCallback(
    async (evaluation: EvaluationV2<EvaluationType.Human>) => {
      if (evaluation.uuid === annotationsEvaluation?.uuid) return
      if (isUpdatingEvaluation) return
      if (annotationsEvaluation) {
        await onUnuseAnnotations(annotationsEvaluation)
      }
      return await updateEvaluation({
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
        settings: {
          configuration: { ...evaluation.configuration, enableControls: true },
        },
      })
    },
    [
      document,
      isUpdatingEvaluation,
      updateEvaluation,
      annotationsEvaluation,
      onUnuseAnnotations,
    ],
  )

  const onToggleLiveEvaluation = useCallback(
    async (evaluation: EvaluationV2) => {
      if (isUpdatingEvaluation) return
      return await updateEvaluation({
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
        options: { evaluateLiveLogs: !evaluation.evaluateLiveLogs },
      })
    },
    [document, isUpdatingEvaluation, updateEvaluation],
  )

  const groupedEvaluations = useMemo(
    () => groupEvaluationsByType(evaluations),
    [evaluations],
  )

  const evaluationTypes = useMemo(
    () =>
      Object.keys(groupedEvaluations).sort((a, b) =>
        a.localeCompare(b, 'en'),
      ) as EvaluationType[],
    [groupedEvaluations],
  )

  return (
    <div className='flex flex-col gap-4'>
      {evaluations.length > 0 ? (
        <div className='flex flex-col gap-8'>
          {evaluationTypes.map((type) => {
            const typeEvaluations = groupedEvaluations[type]
            if (!typeEvaluations || typeEvaluations.length === 0) return null

            return (
              <div key={type} className='flex flex-col gap-2'>
                <span className='flex items-center gap-2'>
                  <Icon
                    name={EVALUATION_SPECIFICATIONS[type].icon}
                    color='foreground'
                    size='normal'
                    className='shrink-0'
                  />
                  <Text.H5M>{EVALUATION_SPECIFICATIONS[type].name}</Text.H5M>
                </span>
                <Table className='table-fixed'>
                  <TableHeader className='isolate sticky top-0 z-10'>
                    <TableRow>
                      <TableHead className='w-[25%]'>Name</TableHead>
                      <TableHead className='w-[40%]'>Description</TableHead>
                      <TableHead className='w-[25%]'>Metric</TableHead>
                      <TableHead className='w-[10%]' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading &&
                      Array.from({ length: 5 }).map((_, index) => (
                        <TableRow
                          key={index}
                          className='border-b-[0.5px] h-12 max-h-12 border-border relative'
                          hoverable={false}
                        >
                          <TableCell>
                            <Skeleton className='h-5 w-[90%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
                          </TableCell>
                        </TableRow>
                      ))}
                    {!isLoading &&
                      typeEvaluations.map((evaluation) => (
                        <EvaluationTableItem
                          key={evaluation.uuid}
                          evaluation={evaluation}
                          annotationsEvaluation={annotationsEvaluation}
                          onUseAnnotations={onUseAnnotations}
                          onUnuseAnnotations={onUnuseAnnotations}
                          onToggleLiveEvaluation={onToggleLiveEvaluation}
                          setSelectedEvaluation={setSelectedEvaluation}
                          setOpenDeleteModal={setOpenDeleteModal}
                          isUpdatingEvaluation={isUpdatingEvaluation}
                          isDeletingEvaluation={isDeletingEvaluation}
                        />
                      ))}
                  </TableBody>
                </Table>
              </div>
            )
          })}
          {openDeleteModal && selectedEvaluation && (
            <ConfirmModal
              dismissible
              open={openDeleteModal}
              title={`Remove ${selectedEvaluation.name} evaluation`}
              type='destructive'
              onOpenChange={setOpenDeleteModal}
              onConfirm={() => onDelete(selectedEvaluation)}
              onCancel={() => setOpenDeleteModal(false)}
              confirm={{
                label: isDeletingEvaluation ? 'Removing...' : 'Remove',
                description:
                  'Are you sure you want to remove the evaluation? This action cannot be undone.',
                disabled: isDeletingEvaluation,
                isConfirming: isDeletingEvaluation,
              }}
            />
          )}
        </div>
      ) : (
        <EvaluationsTableBlankSlate
          createEvaluation={createEvaluation}
          generateEvaluation={generateEvaluation}
          generatorEnabled={generatorEnabled}
          isCreatingEvaluation={isCreatingEvaluation}
          isGeneratingEvaluation={isGeneratingEvaluation}
        />
      )}
    </div>
  )
}
