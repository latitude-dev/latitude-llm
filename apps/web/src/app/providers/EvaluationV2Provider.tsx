'use client'

import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { createContext, ReactNode, useContext, useMemo } from 'react'
import { useCurrentDocument } from './DocumentProvider'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/constants'

type IEvaluationV2ContextType<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
}

const EvaluationV2Context = createContext<IEvaluationV2ContextType>(
  {} as IEvaluationV2ContextType,
)

const EvaluationV2Provider = ({
  evaluation: fallbackEvaluation,
  children,
}: {
  evaluation: EvaluationV2
  children: ReactNode
}) => {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: evaluations } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
  })

  const evaluation = useMemo(
    () =>
      evaluations.find((e) => e.uuid === fallbackEvaluation.uuid) ??
      fallbackEvaluation,
    [evaluations, fallbackEvaluation],
  )

  return (
    <EvaluationV2Context.Provider value={{ evaluation }}>
      {children}
    </EvaluationV2Context.Provider>
  )
}

const useCurrentEvaluationV2 = <
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>() => {
  const context = useContext(EvaluationV2Context)
  if (!context) {
    throw new Error(
      'useCurrentEvaluationV2 must be used within a EvaluationV2Provider',
    )
  }

  return context as IEvaluationV2ContextType<T, M>
}

export {
  EvaluationV2Provider,
  useCurrentEvaluationV2,
  type IEvaluationV2ContextType,
}
