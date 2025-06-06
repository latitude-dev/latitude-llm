import { Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'

export type LatteToolFn<P extends { [key: string]: unknown } = {}> = (args: {
  workspace: Workspace
  parameters: P
}) => PromisedResult<unknown>
