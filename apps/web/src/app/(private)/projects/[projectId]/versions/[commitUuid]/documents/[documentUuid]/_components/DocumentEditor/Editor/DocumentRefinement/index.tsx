import {
  PlaygroundAction,
  usePlaygroundAction,
} from '$/hooks/usePlaygroundAction'
import { useRefiner } from '$/hooks/useRefiner'
import { ROUTES } from '$/services/routes'
import { DocumentVersion } from '@latitude-data/core/browser'
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

  const [evaluationId, setEvaluationId] = useState<number | undefined>(
    playgroundAction?.version === 'v1'
      ? playgroundAction.evaluationId
      : undefined,
  )
  const [resultIds, setResultIds] = useState<number[]>(
    playgroundAction?.version === 'v1' ? playgroundAction.resultIds : [],
  )

  const [evaluationUuid, setEvaluationUuid] = useState<string | undefined>(
    playgroundAction?.version === 'v2'
      ? playgroundAction.evaluationUuid
      : undefined,
  )
  const [resultUuids, setResultUuids] = useState<string[]>(
    playgroundAction?.version === 'v2' ? playgroundAction.resultUuids : [],
  )

  const reset = useCallback(() => {
    resetPlaygroundAction()
    setEvaluationId(undefined)
    setResultIds([])
    setEvaluationUuid(undefined)
    setResultUuids([])
  }, [
    resetPlaygroundAction,
    setEvaluationId,
    setResultIds,
    setEvaluationUuid,
    setResultUuids,
  ])

  const refine = useCallback(async () => {
    const [refinement, error] = await refinePrompt({
      evaluationId: evaluationId,
      evaluationUuid: evaluationUuid,
      resultIds: resultIds,
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

    setOpenModal(false)
    reset()
  }, [
    evaluationId,
    evaluationUuid,
    resultIds,
    resultUuids,
    refinePrompt,
    cancelled,
    setDiff,
    setPrompt,
    refineApply,
    setOpenModal,
    reset,
    project,
    document,
    router,
  ])

  if (!refinementEnabled) return null
  if (document.promptlVersion === 0) return null

  const step = useMemo(() => {
    if (resultIds.length > 0 || resultUuids.length > 0) {
      return {
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
      }
    }

    if (evaluationId || evaluationUuid) {
      return {
        number: 2,
        title: 'Select relevant results',
        description:
          'Select the evaluation results that you think may be relevant to improve the prompt.',
        content: (
          <Step2
            project={project}
            commit={commit}
            document={document}
            evaluationId={evaluationId}
            setResultIds={setResultIds}
            evaluationUuid={evaluationUuid}
            setResultUuids={setResultUuids}
            reset={reset}
          />
        ),
      }
    }

    return {
      number: 1,
      title: 'Select evaluation',
      description:
        'Select an evaluation and our system will take the results, where it is not performing well, to improve the prompt.',
      content: (
        <Step1
          project={project}
          commit={commit}
          document={document}
          setEvaluationId={setEvaluationId}
          setEvaluationUuid={setEvaluationUuid}
        />
      ),
    }
  }, [document, evaluationId, evaluationUuid, resultIds, resultUuids])

  return (
    <>
      <Button
        variant='outline'
        size='small'
        iconProps={{
          name: 'sparkles',
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
            if (!open) reset()
          }}
          steps={{ current: step.number, total: 3 }}
          dismissible
        >
          {step.content}
        </Modal>
      )}
    </>
  )
}
