import { EvaluationInputsByDocument, EVALUATION_EMPTY_INPUTS } from './types'

export function getDocState(
  oldState: EvaluationInputsByDocument | null,
  key: string,
) {
  const state = oldState ?? {}
  const doc = state[key] ?? EVALUATION_EMPTY_INPUTS
  return { state, doc }
}
