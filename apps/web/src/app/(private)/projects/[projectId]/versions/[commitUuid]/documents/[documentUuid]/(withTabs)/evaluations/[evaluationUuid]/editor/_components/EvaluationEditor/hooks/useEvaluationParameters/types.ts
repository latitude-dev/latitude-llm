export const EVALUATION_INPUT_SOURCE = {
  history: 'history',
} as const

export type EvaluationInputSource =
  (typeof EVALUATION_INPUT_SOURCE)[keyof typeof EVALUATION_INPUT_SOURCE]

export type EvaluationPlaygroundInputs<S extends EvaluationInputSource> = {
  source: S
  history: {
    logUuid: string | undefined
  }
}

export type EvaluationInputsByDocument = Record<
  string,
  EvaluationPlaygroundInputs<EvaluationInputSource>
>

export const EVALUATION_EMPTY_INPUTS: EvaluationPlaygroundInputs<'history'> = {
  source: EVALUATION_INPUT_SOURCE.history,
  history: { logUuid: undefined },
}
