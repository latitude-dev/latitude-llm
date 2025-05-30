import {
  PlaygroundAction,
  usePlaygroundAction,
} from '$/hooks/usePlaygroundAction'
import { useRefiner } from '$/hooks/useRefiner'
import { ROUTES } from '$/services/routes'
import { DocumentVersion, EvaluationV2 } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import { useRouter } from 'next/navigation'
import type { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Step1 } from './Step1'
import { Step2 } from './Step2'
import { Step3 } from './Step3'

export function DocumentRefinement({
  project,
  commit,
  document,
  setDiff,
  setPrompt,
  refinementEnabled,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  setDiff: (value?: DiffOptions) => void
  setPrompt: (prompt: string) => void
  refinementEnabled: boolean
}) {
  const router = useRouter()

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
          selectedEvaluationUuid={selectedEvaluation?.uuid}
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
        onClick={() => setOpenModal(true)}
      >
        <Text.H6>Refine</Text.H6>
      </Button>
      {openModal && (
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
