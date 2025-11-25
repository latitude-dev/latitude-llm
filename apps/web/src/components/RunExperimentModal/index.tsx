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
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
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
  const { toast } = useToast()

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
    const source = formPayload.selectedParametersSource

    // Validation: if using dataset source and have parameters, need dataset selected
    if (
      source === 'dataset' &&
      formPayload.parameters.length > 0 &&
      !formPayload.selectedDataset
    ) {
      toast({
        title: 'Error',
        description: 'Please select a dataset',
        variant: 'destructive',
      })
      return
    }

    // Validation: if using logs source, need at least 1 log
    if (source === 'logs' && (!formPayload.toLine || formPayload.toLine < 1)) {
      toast({
        title: 'Error',
        description: 'Please select at least 1 log',
        variant: 'destructive',
      })
      return
    }

    // Validation: if using manual source, need at least 1 run
    if (
      source === 'manual' &&
      (!formPayload.toLine || formPayload.toLine < 0)
    ) {
      toast({
        title: 'Error',
        description: 'Please select at least 1 run',
        variant: 'destructive',
      })
      return
    }

    // Build parametersPopulation with discriminated union based on source type
    let parametersPopulation
    if (source === 'dataset') {
      parametersPopulation = {
        source: 'dataset' as const,
        datasetId: formPayload.selectedDataset!.id,
        parametersMap: formPayload.parametersMap,
        datasetLabels: formPayload.datasetLabels,
        fromRow: formPayload.fromLine ?? 1,
        toRow: formPayload.toLine ?? 0,
      }
    } else if (source === 'logs') {
      parametersPopulation = {
        source: 'logs' as const,
        count: (formPayload.toLine ?? 0) + 1,
      }
    } else {
      // manual
      parametersPopulation = {
        source: 'manual' as const,
        // For manual experiments, toLine represents count - 1 (since it's 0-indexed in UI)
        count: (formPayload.toLine ?? 0) + 1,
        parametersMap: formPayload.parametersMap,
      }
    }

    create({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      variants: formPayload.variants,
      evaluationUuids: formPayload.selectedEvaluations.map((ev) => ev.uuid),
      parametersPopulation,
      simulationSettings: formPayload.simulationSettings,
    })
  }, [
    formPayload,
    project.id,
    commit.uuid,
    document.documentUuid,
    create,
    toast,
  ])

  const { setVariants, addNewVariant } = formPayload

  useEffect(() => {
    setVariants([])
    addNewVariant()
  }, [setVariants, addNewVariant, isOpen])

  const isLoading = !document || isCreating || formPayload.isLoadingMetadata
  const noRunsSelected =
    formPayload.selectedParametersSource === 'dataset'
      ? !formPayload.selectedDataset
      : formPayload.toLine === undefined ||
        formPayload.toLine < formPayload.fromLine

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
            disabled={isLoading || noRunsSelected}
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
