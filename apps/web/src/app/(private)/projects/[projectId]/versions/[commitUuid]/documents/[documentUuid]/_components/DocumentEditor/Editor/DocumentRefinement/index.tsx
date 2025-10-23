import {
  PlaygroundAction,
  usePlaygroundAction,
} from '$/hooks/usePlaygroundAction'
import { useRefiner } from '$/hooks/useRefiner'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import type { DiffOptions } from '@latitude-data/web-ui/molecules/DocumentTextEditor/types'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import type { IProjectContextType } from '$/app/providers/ProjectProvider'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { Step1 } from './Step1'
import { Step2 } from './Step2'
import { Step3 } from './Step3'

import { EvaluationV2 } from '@latitude-data/core/constants'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
export function DocumentRefinement({
  project,
  commit,
  document,
  diff,
  setDiff,
  setPrompt,
  refinementEnabled,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  diff?: DiffOptions
  setDiff: (value?: DiffOptions) => void
  setPrompt: (prompt: string) => void
  refinementEnabled: boolean
}) {
  const router = useRouter()
  const { diffOptions } = useDocumentValue()

  const { playgroundAction, resetPlaygroundAction } = usePlaygroundAction({
    action: PlaygroundAction.RefinePrompt,
    project: project,
    commit: commit,
    document: document,
  })

  const [openModal, setOpenModal] = useState(!!playgroundAction)
  const cancelled = useRef(!openModal)
  cancelled.current = !openModal

  const { refinePrompt, refineApply } = useRefiner(
    { project, commit, document },
    cancelled,
  )

  const [evaluationUuid, setEvaluationUuid] = useState<string | undefined>(
    playgroundAction?.evaluationUuid,
  )
  const [resultUuids, setResultUuids] = useState<string[]>(
    playgroundAction?.resultUuids || [],
  )

  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationV2>()
  const [selectedResultUuids, setSelectedResultUuids] = useState<string[]>([])

  const reset = useCallback(() => {
    resetPlaygroundAction()
    setEvaluationUuid(undefined)
    setResultUuids([])
    setSelectedEvaluation(undefined)
    setSelectedResultUuids([])
  }, [
    resetPlaygroundAction,
    setEvaluationUuid,
    setResultUuids,
    setSelectedEvaluation,
    setSelectedResultUuids,
  ])

  const close = useCallback(() => {
    setOpenModal(false)
    reset()
  }, [setOpenModal, reset])

  const refine = useCallback(async () => {
    const [refinement, error] = await refinePrompt({
      evaluationUuid: evaluationUuid,
      resultUuids: resultUuids,
    })

    if (cancelled.current) return

    if (!error) {
      setDiff({
        newValue: refinement.prompt,
        description: refinement.summary,
        source: 'refine',
        onAccept: async (prompt) => {
          const [result, error] = await refineApply({ prompt })
          if (error) return

          setDiff(undefined)

          if (result.draft) {
            router.push(
              ROUTES.projects
                .detail({ id: project.id })
                .commits.detail({ uuid: result.draft.uuid })
                .documents.detail({ uuid: document.documentUuid }).root,
            )
          } else {
            setPrompt(prompt)
          }
        },
        onReject: () => setDiff(undefined),
      })
    }

    close()
  }, [
    evaluationUuid,
    resultUuids,
    refinePrompt,
    cancelled,
    setDiff,
    setPrompt,
    refineApply,
    close,
    project,
    document,
    router,
  ])

  let step
  if (resultUuids.length > 0) {
    step = {
      number: 3,
      title: 'Generating prompt suggestion',
      description:
        'We are reviewing evaluations with poor results, to identify why the prompt failed, and propose suitable modifications.',
      content: (
        <Step3
          project={project}
          commit={commit}
          document={document}
          refine={refine}
        />
      ),
      footer: (
        <Button variant='outline' fancy onClick={close}>
          Close
        </Button>
      ),
    }
  } else if (evaluationUuid) {
    step = {
      number: 2,
      title: 'Select relevant results',
      description:
        'Select the evaluation results that you think may be relevant to improve the prompt.',
      content: (
        <Step2
          project={project}
          commit={commit}
          document={document}
          evaluationUuid={evaluationUuid}
          selectedResultUuids={selectedResultUuids}
          setSelectedResultUuids={setSelectedResultUuids}
        />
      ),
      footer: (
        <>
          <Button variant='outline' fancy onClick={reset}>
            Go back
          </Button>
          <Button
            fancy
            onClick={() => {
              setResultUuids(selectedResultUuids)
            }}
            disabled={!selectedResultUuids.length}
          >
            Select results
          </Button>
        </>
      ),
    }
  } else {
    step = {
      number: 1,
      title: 'Select evaluation',
      description:
        'Select an evaluation and our system will take the results, where it is not performing well, to improve the prompt.',
      content: (
        <Step1
          project={project}
          commit={commit}
          document={document}
          selectedEvaluation={selectedEvaluation}
          setSelectedEvaluation={setSelectedEvaluation}
        />
      ),
      footer: (
        <>
          <Button variant='outline' fancy onClick={close}>
            Close
          </Button>
          <Button
            fancy
            onClick={() => {
              setEvaluationUuid(selectedEvaluation!.uuid)
            }}
            disabled={!selectedEvaluation}
          >
            Select evaluation
          </Button>
        </>
      ),
    }
  }

  const isDisabled = !refinementEnabled || !!diff

  if (diffOptions) return null
  if (!refinementEnabled) return null
  if (document.promptlVersion === 0) return null

  return (
    <>
      <Button
        variant='outline'
        size='small'
        iconProps={{
          name: 'brain',
          size: 'small',
        }}
        containerClassName='flex-shrink-0'
        onClick={() => setOpenModal(true)}
        disabled={isDisabled}
      >
        <Text.H6 userSelect={false}>Refine</Text.H6>
      </Button>
      {openModal && !isDisabled && (
        <Modal
          title={step.title}
          description={step.description}
          size='large'
          open={openModal}
          onOpenChange={(open) => {
            setOpenModal(open)
            if (!open) close()
          }}
          steps={{ current: step.number, total: 3 }}
          dismissible
          footer={step.footer}
        >
          {step.content}
        </Modal>
      )}
    </>
  )
}
