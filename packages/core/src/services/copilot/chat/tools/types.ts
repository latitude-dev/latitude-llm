import { Message, ToolCall } from '@latitude-data/compiler'
import { Commit, Project, Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'
import { WorkerSocket } from '../../../../websockets/workers'

export type CopilotTool<P extends { [key: string]: unknown } = {}> = (
  parameters: P,
  context: {
    websockets: WorkerSocket
    workspace: Workspace
    project: Project
    commit: Commit
    chatUuid: string
    messages: Message[]
    toolCall: ToolCall
  },
) => PromisedResult<unknown>
