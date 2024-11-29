import { useCallback, useState } from 'react'

import {
  DocumentVersion,
  EvaluationDto,
  EvaluationResult,
} from '@latitude-data/core/browser'
import { type EvaluationResultByDocument } from '@latitude-data/core/repositories'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import { useRouter } from 'next/navigation'

/**
 * This hook deals with refinement modal state
 * A refinement can be started from the document
 * or from a evaluation results list. The user picks some
 * evaluation results and navigate to the document page to
 * the final state on the refinement process.
 */
export function useRefinement({
  projectId,
  commitUuid,
  document,
  serverEvaluation,
  serverEvaluationResults,
}: {
  projectId: number
  commitUuid: string
  document: DocumentVersion
  serverEvaluation: EvaluationDto | undefined
  serverEvaluationResults: EvaluationResult[]
}) {
  const navigate = useRouter()
  const openRefinementFromServer =
    serverEvaluation && serverEvaluationResults.length > 0
  const [evaluation, setEvaluation] = useState<EvaluationDto | undefined>(
    serverEvaluation,
  )
  const [evaluationResults, setEvaluationResults] = useState<
    EvaluationResultByDocument[]
    // NOTE: We lie here. From server we receive EvaluationResult[],
    // but we need EvaluationResultByDocument[] for the second step.
    // The thing is that when a refine comes from a evaluation we jump to step
    // 3 directly and we don't need `evaluationResult.result` field which is
    // not present in basic EvaluationResult.
  >(serverEvaluationResults as unknown as EvaluationResultByDocument[])
  const modal = useToggleModal({ initialState: openRefinementFromServer })

  const cleanServer = useCallback(() => {
    setEvaluation(undefined)
    setEvaluationResults([])
    // Clean refinement IDs to avoid re-running the same refinement
    navigate.replace(
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: document.documentUuid }).root,
    )
  }, [openRefinementFromServer, document.documentUuid, commitUuid, projectId])

  const onClose = useCallback(() => {
    modal.onClose()
    cleanServer()
  }, [modal.onClose])

  return {
    modal: {
      ...modal,
      onClose,
    },
    server: {
      evaluation,
      evaluationResults,
    },
  }
}
