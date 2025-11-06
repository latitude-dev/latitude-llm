import { useExperiments } from '$/stores/experiments'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useCallback, useEffect } from 'react'
import { useExperimentFormPayload } from './ExperimentForm/useExperimentFormPayload'
import ExperimentModalForm from './ExperimentForm'
import { useNavigate } from '$/hooks/useNavigate'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'
import { EvaluationV2 } from '@latitude-data/core/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
export function RunExperimentModal({
  project,
  commit,
  document,
  isOpen,
  setOpen,
  initialEvaluation,
  onCreate: onCreateCb,
  navigateOnCreate,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  isOpen: boolean
  setOpen: (open: boolean) => void
  initialEvaluation?: EvaluationV2
  onCreate?: (experiments: ExperimentDto[]) => void
  navigateOnCreate?: boolean
}) {
  const router = useNavigate()

  const { count } = useExperiments({
    projectId: project.id,
    documentUuid: document.documentUuid,
    page: 1,
    pageSize: 1,
  })

  const { create, isCreating } = useExperiments(
    {
      projectId: project.id,
      documentUuid: document.documentUuid,
    },
    {
      onCreate: (experiments) => {
        setOpen(false)
        onCreateCb?.(experiments)

        if (!navigateOnCreate) return
        router.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: document.documentUuid })
            [DocumentRoutes.experiments].withSelected(
              experiments.map((exp) => exp.uuid),
            ),
        )
      },
    },
  )

  const formPayload = useExperimentFormPayload({
    project,
    commit,
    document,
    initialEvaluation,
    experimentCount: count,
  })

  const createExperiment = useCallback(() => {
    if (formPayload.parameters.length > 0 && !formPayload.selectedDataset) {
      return
    }
    create({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      variants: formPayload.variants,
      datasetId: formPayload.selectedDataset?.id,
      parametersMap: formPayload.parametersMap,
      datasetLabels: formPayload.datasetLabels,
      fromRow: formPayload.fromLine ?? 1,
      toRow: formPayload.toLine,
      evaluationUuids: formPayload.selectedEvaluations.map((ev) => ev.uuid),
      simulationSettings: formPayload.simulationSettings,
    })
  }, [formPayload, project.id, commit.uuid, document.documentUuid, create])

  const { setVariants, addNewVariant } = formPayload

  useEffect(() => {
    setVariants([])
    addNewVariant()
  }, [setVariants, addNewVariant, isOpen])

  return (
    <Modal
      open={isOpen}
      onOpenChange={setOpen}
      size='xl'
      title='Run New Experiment'
      description='Create and evaluate a batch of logs for this document based on a selected dataset.'
      dismissible
      footer={
        <>
          <CloseTrigger />
          <Button
            disabled={
              !document ||
              isCreating ||
              formPayload.isLoadingMetadata ||
              (formPayload.parameters.length > 0 &&
                !formPayload.selectedDataset)
            }
            fancy
            onClick={createExperiment}
          >
            Run Experiment
          </Button>
        </>
      }
    >
      <div className='w-full max-w-full relative'>
        <ExperimentModalForm {...formPayload} />
      </div>
    </Modal>
  )
}
