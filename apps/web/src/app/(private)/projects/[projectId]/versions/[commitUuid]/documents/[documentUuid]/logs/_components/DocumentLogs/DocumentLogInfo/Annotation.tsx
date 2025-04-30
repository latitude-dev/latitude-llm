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
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { ComponentProps, useCallback, useEffect, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

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

  const onAnnotate = useDebouncedCallback(
    useCallback(
      async ({
        resultScore,
        resultMetadata,
      }: {
        resultScore: number
        resultMetadata?: Partial<EvaluationResultMetadata<T, M>>
      }) => {
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
      },
      [
        annotateEvaluation,
        evaluation,
        providerLog,
        documentLog,
        mutateEvaluationResults,
      ],
    ),
    500,
    { leading: false, trailing: true },
  )

  const onSetResultScore = useCallback(
    async (value: number) => {
      setResultScore(value)
      onAnnotate({ resultScore: value, resultMetadata })
    },
    [setResultScore, onAnnotate, resultMetadata],
  )

  const onSetResultMetadata = useCallback(
    async (value: Partial<EvaluationResultMetadata<T, M>>) => {
      setResultMetadata(value)
      if (resultScore === undefined) return
      onAnnotate({ resultScore, resultMetadata: value })
    },
    [setResultMetadata, onAnnotate, resultScore],
  )

  return (
    <CollapsibleBox
      title={evaluation.name}
      icon={getEvaluationMetricSpecification(evaluation).icon}
      isExpanded={isExpanded}
      onToggle={(value) => setIsExpanded(value)}
      expandedContent={
        <AnnotationForm
          evaluation={evaluation}
          resultScore={resultScore}
          setResultScore={onSetResultScore}
          resultMetadata={resultMetadata}
          setResultMetadata={onSetResultMetadata}
          providerLog={providerLog}
          documentLog={documentLog}
          {...rest}
        />
      }
    />
  )
}
