import { EVALUATION_EMPTY_INPUTS, EvaluationInputsByDocument } from './types'

export function getDocState(
  oldState: EvaluationInputsByDocument | null,
  key: string,
) {
  const state = oldState ?? {}
  const doc = state[key] ?? EVALUATION_EMPTY_INPUTS
  return { state, doc }
}
