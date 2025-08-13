import { ActionType } from '@latitude-data/core/browser'
import { CloneAgentActionSpecification } from './cloneAgent'
import { CreateAgentActionSpecification } from './createAgent'
import { ActionFrontendSpecification } from './shared'

export const ACTION_SPECIFICATIONS = {
  [ActionType.CreateAgent]: CreateAgentActionSpecification,
  [ActionType.CloneAgent]: CloneAgentActionSpecification,
} as const satisfies {
  [T in ActionType]: ActionFrontendSpecification<T>
}
