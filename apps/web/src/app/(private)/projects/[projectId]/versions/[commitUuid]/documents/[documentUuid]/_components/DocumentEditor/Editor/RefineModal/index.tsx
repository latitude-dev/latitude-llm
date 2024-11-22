'use client'

import { ReactNode, useMemo, useState } from 'react'

import { DocumentVersion, EvaluationDto } from '@latitude-data/core/browser'
import { type EvaluationResultByDocument } from '@latitude-data/core/repositories'
import { Modal } from '@latitude-data/web-ui'

import { SelectEvaluation } from './steps/1_SelectEvaluation'
import { SelectEvaluationResults } from './steps/2_SelectEvaluationResults'
import { GenerateSuggestion } from './steps/3_GenerateSuggestion'

type StepData = {
  currentStep: number
  title: string
  description: string
  content: ReactNode
}

export default function RefineDocumentModal({
  onClose,
  documentVersion,
  setDocumentContent,
  serverEvaluation,
  serverEvaluationResults,
}: {
  onClose: () => void
  documentVersion?: DocumentVersion
  setDocumentContent: (content: string) => void
  serverEvaluation: EvaluationDto | undefined
  serverEvaluationResults: EvaluationResultByDocument[]
}) {
  const [evaluation, setEvaluation] = useState<EvaluationDto | undefined>(
    serverEvaluation,
  )
  const [evaluationResults, setEvaluationResults] = useState<
    EvaluationResultByDocument[]
  >(serverEvaluationResults)

  const applySuggestion = (prompt: string) => {
    setDocumentContent(prompt)
    onClose()
  }

  if (!documentVersion) return null

  const { currentStep, content, title, description } = useMemo<StepData>(() => {
    if (evaluation && evaluationResults.length) {
      return {
        currentStep: 3,
        title: 'Generating prompt suggestion',
        description:
          'We are reviewing evaluations with poor results to identify why the prompt failed and then propose suitable modifications.',
        content: (
          <GenerateSuggestion
            documentVersion={documentVersion}
            evaluation={evaluation}
            evaluationResults={evaluationResults}
            applySuggestion={applySuggestion}
          />
        ),
      }
    }

    if (evaluation) {
      return {
        currentStep: 2,
        title: 'Select relevant results',
        description:
          'Now select the evaluation results that you think may be relevant to improve the prompt.',
        content: (
          <SelectEvaluationResults
            evaluation={evaluation}
            setEvaluationResults={setEvaluationResults}
            navigateBack={() => setEvaluation(undefined)}
            documentVersion={documentVersion}
          />
        ),
      }
    }

    return {
      currentStep: 1,
      title: 'Select an evaluation',
      description:
        'To generate a suggestion, select an evaluation and our system will take the results where it is not performing well to improve the prompt.',
      content: (
        <SelectEvaluation
          setEvaluation={setEvaluation}
          documentVersion={documentVersion}
        />
      ),
    }
  }, [documentVersion, evaluation, evaluationResults])

  return (
    <Modal
      open
      title={title}
      description={description}
      size='large'
      onOpenChange={onClose}
      steps={{ current: currentStep, total: 3 }}
    >
      {content}
    </Modal>
  )
}
