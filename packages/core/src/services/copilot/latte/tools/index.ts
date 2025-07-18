import { LatteTool } from '@latitude-data/constants/latte'
import { User, Workspace } from '../../../../browser'
import { Result, TypedResult } from '../../../../lib/Result'
import type { LatteToolFn } from './types'

import listDrafts from './commits/list'
import listPrompts from './documents/list'
import readPrompt from './documents/read'
import editProject from './projects/edit'
import listProjects from './projects/list'
import listIntegrations from './settings/listIntegrations'
import listIntegrationTools from './settings/listIntegrationTools'
import listProviders from './settings/listProviders'
import listIntegrationTriggers from './settings/listIntegrationTriggers'
import think from './general/think'
import searchIntegrationResources from './settings/searchIntegrationResources'
import searchIntegrationApps from './settings/searchIntegrationApps'
import createIntegration from './settings/createIntegration'
import { ToolHandler } from '../../../../lib/streamManager/clientTools/handlers'
import triggerActions from './triggers/triggerActions'
import listExistingTriggers from './triggers/listExistingTriggers'

export const LATTE_TOOLS: Record<LatteTool, LatteToolFn<any>> = {
  [LatteTool.think]: think,
  [LatteTool.listProjects]: listProjects,
  [LatteTool.listDrafts]: listDrafts,
  [LatteTool.listPrompts]: listPrompts,
  [LatteTool.readPrompt]: readPrompt,
  [LatteTool.editProject]: editProject,
  [LatteTool.listProviders]: listProviders,
  [LatteTool.listIntegrations]: listIntegrations,
  [LatteTool.listIntegrationTools]: listIntegrationTools,
  [LatteTool.searchIntegrationResources]: searchIntegrationResources,
  [LatteTool.searchIntegrationApps]: searchIntegrationApps,
  [LatteTool.createIntegration]: createIntegration,
  [LatteTool.listIntegrationTriggers]: listIntegrationTriggers,
  [LatteTool.triggerActions]: triggerActions,
  [LatteTool.listExistingTriggers]: listExistingTriggers,
} as const

export function buildToolHandlers({
  workspace,
  threadUuid,
  user,
}: {
  workspace: Workspace
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
            toolName,
            toolCall,
            user,
          })
        } catch (error) {
          result = Result.error(error as Error)
        }

        return Result.isOk(result)
          ? result.value
          : {
              error: { name: result.error.name, message: result.error.message },
            }
      }
      return acc
    },
    {} as Record<LatteTool, ToolHandler>,
  )
}
