import { ActionType } from '../../constants'
import { CloneAgentActionSpecification } from './cloneAgent'
import { CreateAgentActionSpecification } from './createAgent'
import { ActionBackendSpecification } from './shared'

export const ACTION_SPECIFICATIONS = {
  [ActionType.CreateAgent]: CreateAgentActionSpecification,
  [ActionType.CloneAgent]: CloneAgentActionSpecification,
} as const satisfies {
  [T in ActionType]: ActionBackendSpecification<T>
}
