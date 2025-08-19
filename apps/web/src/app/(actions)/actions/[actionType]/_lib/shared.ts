import { useDeferredPlaygroundAction } from '$/hooks/usePlaygroundAction'
import {
  ActionFrontendParameters,
  ActionType,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

// prettier-ignore
type ZodSchema<T = any> = z.ZodObject<z.ZodRawShape, z.UnknownKeysParam, z.ZodTypeAny, T, T>

export type ActionExecuteArgs<T extends ActionType = ActionType> = {
  parameters: ActionFrontendParameters<T>
  user: User
  workspace: Workspace
  router: ReturnType<typeof useRouter>
  setPlaygroundAction: ReturnType<
    typeof useDeferredPlaygroundAction
  >['setPlaygroundAction']
}

export type ActionFrontendSpecification<T extends ActionType = ActionType> = {
  parameters: ZodSchema<ActionFrontendParameters<T>>
  execute: (args: ActionExecuteArgs<T>) => Promise<void | never>
}
