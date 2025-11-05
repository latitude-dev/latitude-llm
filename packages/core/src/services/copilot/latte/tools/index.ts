import { LatteTool } from '@latitude-data/constants/latte'
import { type User } from '../../../../schema/models/types/User'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { type Project } from '../../../../schema/models/types/Project'
import { Result, TypedResult } from '../../../../lib/Result'
import type { LatteToolFn } from './types'

import listDrafts from './commits/list'
import listPrompts from './documents/list'
import readPrompt from './documents/read'
import editProject from './projects/editProject'
import writePrompt from './projects/writePrompt'
import deletePrompt from './projects/deletePrompt'
import listProjects from './projects/list'
import listExistingIntegrations from './settings/listExistingIntegrations'
import listIntegrationTools from './settings/listIntegrationTools'
import listProviders from './settings/listProviders'
import listIntegrationTriggers from './triggers/listIntegrationTriggers'
import think from './general/think'
import searchAvailableIntegrations from './settings/searchAvailableIntegrations'
import createIntegration from './settings/createIntegration'
import { ToolHandler } from '../../../documents/tools/clientTools/handlers'
import { getFullTriggerConfigSchema } from './triggers/getFullTriggerConfigSchema'
import { validateTriggerSchema } from './triggers/validateTriggerSchema'
import { LatteInvalidChoiceError } from './triggers/configValidator'
import createTrigger from './triggers/actions/createTrigger'
import updateTrigger from './triggers/actions/updateTrigger'
import deleteTrigger from './triggers/actions/deleteTrigger'

export const LATTE_TOOLS: Record<LatteTool, LatteToolFn<any>> = {
  [LatteTool.think]: think,
  [LatteTool.listProjects]: listProjects,
  [LatteTool.listDrafts]: listDrafts,
  [LatteTool.listPrompts]: listPrompts,
  [LatteTool.readPrompt]: readPrompt,
  [LatteTool.editProject]: editProject,
  [LatteTool.deletePrompt]: deletePrompt,
  [LatteTool.listProviders]: listProviders,
  [LatteTool.listExistingIntegrations]: listExistingIntegrations,
  [LatteTool.listIntegrationTools]: listIntegrationTools,
  [LatteTool.listIntegrationTriggers]: listIntegrationTriggers,
  [LatteTool.searchAvailableIntegrations]: searchAvailableIntegrations,
  [LatteTool.createIntegration]: createIntegration,
  [LatteTool.createTrigger]: createTrigger,
  [LatteTool.updateTrigger]: updateTrigger,
  [LatteTool.deleteTrigger]: deleteTrigger,
  [LatteTool.getFullTriggerSchema]: getFullTriggerConfigSchema,
  [LatteTool.validateTriggerSchema]: validateTriggerSchema,
  [LatteTool.writePrompt]: writePrompt,
} as const

export function buildToolHandlers({
  workspace,
  project,
  threadUuid,
  user,
}: {
  workspace: Workspace
  project: Project
  threadUuid: string
  user: User
}): Record<LatteTool, ToolHandler> {
  const latteToolEntries = Object.entries(LATTE_TOOLS) as [
    LatteTool,
    LatteToolFn<any>,
  ][]
  return latteToolEntries.reduce(
    (acc, [toolName, toolFn]) => {
      acc[toolName] = async ({ args, context, toolCall }) => {
        let result: TypedResult<unknown, Error>
        try {
          result = await toolFn(args, {
            context,
            threadUuid,
            workspace,
            project,
            toolName,
            toolCall,
            user,
          })
        } catch (error) {
          result = Result.error(error as Error)
        }

        return Result.isOk(result)
          ? result.value
          : { error: serializeError(result.error) }
      }
      return acc
    },
    {} as Record<LatteTool, ToolHandler>,
  )
}

function serializeError(error: Error): Record<string, unknown> {
  if (error instanceof LatteInvalidChoiceError) {
    return {
      name: error.name,
      message: error.message,
      errors: error.errors,
      fullSchema: error.fullSchema,
    }
  }
  return {
    name: error.name,
    message: error.message,
  }
}
