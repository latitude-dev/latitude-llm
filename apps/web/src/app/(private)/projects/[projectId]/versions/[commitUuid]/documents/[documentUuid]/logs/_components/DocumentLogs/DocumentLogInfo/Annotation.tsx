import { getEvaluationMetricSpecification } from '$/components/evaluations'
import AnnotationForm from '$/components/evaluations/AnnotationForm'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationResultMetadata,
  EvaluationResultV2,
  EvaluationType,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { isEqual } from 'lodash-es'
import { ComponentProps, useCallback, useEffect, useState } from 'react'

export function DocumentLogAnnotation<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  result,
  mutateEvaluationResults,
  providerLog,
  documentLog,
  annotateEvaluation,
  isAnnotatingEvaluation,
  ...rest
}: Omit<
  ComponentProps<typeof AnnotationForm<T, M>>,
  'resultScore' | 'setResultScore' | 'resultMetadata' | 'setResultMetadata'
> & {
  result?: EvaluationResultV2<T, M>
  mutateEvaluationResults: ReturnType<
    typeof useEvaluationResultsV2ByDocumentLogs
  >['mutate']
  annotateEvaluation: ReturnType<typeof useEvaluationsV2>['annotateEvaluation']
  isAnnotatingEvaluation: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  const [resultScore, setResultScore] = useState<number | undefined>(
    result?.score ?? undefined,
  )
  useEffect(() => setResultScore(result?.score ?? undefined), [result])
  const [resultMetadata, setResultMetadata] = useState<
    Partial<EvaluationResultMetadata<T, M>> | undefined
  >(result?.metadata ?? undefined)
  useEffect(() => setResultMetadata(result?.metadata ?? undefined), [result])

  const onAnnotate = useCallback(async () => {
    if (isAnnotatingEvaluation) return
    if (resultScore === undefined) return
    const [annotationResult, errors] = await annotateEvaluation({
      evaluationUuid: evaluation.uuid,
      resultScore: resultScore,
      resultMetadata: resultMetadata as Partial<EvaluationResultMetadata>,
      providerLogUuid: providerLog.uuid,
    })
    if (errors) return

    const { result } = annotationResult
    mutateEvaluationResults((prev) => {
      const prevResults = prev?.[documentLog.uuid] || []
      const existingResult = prevResults.find(
        (r) => r.result.uuid === result.uuid,
      )
      return {
        ...(prev ?? {}),
        [documentLog.uuid]: existingResult
          ? prevResults.map((r) =>
              r.result.uuid === result.uuid ? { evaluation, result } : r,
            )
          : [{ evaluation, result }, ...prevResults],
      }
    })
  }, [
    isAnnotatingEvaluation,
    annotateEvaluation,
    resultScore,
    resultMetadata,
    evaluation,
    providerLog,
    documentLog,
    mutateEvaluationResults,
  ])

  return (
    <CollapsibleBox
      title={evaluation.name}
      icon={getEvaluationMetricSpecification(evaluation).icon}
      isExpanded={isExpanded}
      onToggle={setIsExpanded}
      scrollable={false}
      expandedContent={
        <div className='w-full flex flex-col gap-y-4'>
          <AnnotationForm
            evaluation={evaluation}
            resultScore={resultScore}
            setResultScore={setResultScore}
            resultMetadata={resultMetadata}
            setResultMetadata={setResultMetadata}
            providerLog={providerLog}
            documentLog={documentLog}
            disabled={isAnnotatingEvaluation}
            {...rest}
          />
          {(resultScore !== result?.score ||
            !isEqual(resultMetadata, result?.metadata)) && (
            <Button
              fullWidth
              fancy
              onClick={onAnnotate}
              disabled={isAnnotatingEvaluation || resultScore === undefined}
            >
              Submit
            </Button>
          )}
        </div>
      }
    />
  )
}
