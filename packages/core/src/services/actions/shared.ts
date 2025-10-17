import { z } from 'zod'
import { Database } from '../../client'
import {
  ActionBackendParameters,
  ActionFrontendParameters,
  ActionType,
} from '../../constants'
import { TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'

// prettier-ignore
type ZodSchema<_T = any> = z.ZodObject

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
