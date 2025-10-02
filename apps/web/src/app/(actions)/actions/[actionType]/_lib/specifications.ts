import { CloneAgentActionSpecification } from './cloneAgent'
import { CreateAgentActionSpecification } from './createAgent'
import { ActionFrontendSpecification } from './shared'
import { ActionType } from '@latitude-data/core/schema/types'

export const ACTION_SPECIFICATIONS = {
  [ActionType.CreateAgent]: CreateAgentActionSpecification,
  [ActionType.CloneAgent]: CloneAgentActionSpecification,
} as const satisfies {
  [T in ActionType]: ActionFrontendSpecification<T>
}
