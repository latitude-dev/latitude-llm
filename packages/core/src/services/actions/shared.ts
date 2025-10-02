import { z } from 'zod'
import { User, Workspace } from '../../schema/types'
import { Database } from '../../client'
import { TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  ActionBackendParameters,
  ActionFrontendParameters,
  ActionType,
} from '@latitude-data/constants/actions'

export { ActionType }

// prettier-ignore
type ZodSchema<T = any> = z.ZodObject<z.ZodRawShape, z.UnknownKeysParam, z.ZodTypeAny, T, T>

export type ActionExecuteArgs<T extends ActionType = ActionType> = {
  parameters: ActionBackendParameters<T>
  user: User
  workspace: Workspace
}

export type ActionBackendSpecification<T extends ActionType = ActionType> = {
  parameters: ZodSchema<ActionBackendParameters<T>>
  execute: (
    args: ActionExecuteArgs<T>,
    db?: Database,
    tx?: Transaction,
  ) => Promise<TypedResult<ActionFrontendParameters<T>>>
}
