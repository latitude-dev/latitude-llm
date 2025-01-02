import { type ToolCallResponse } from '@latitude-data/constants'

export type OnToolCallActionArgs = {
  documentLogUuid: string
  toolCallResponse: ToolCallResponse
}
export type OnToolCallActionFn = (args: OnToolCallActionArgs) => void
export type AddToolResponseData = {
  documentLogUuid: string
  addToolResponse: OnToolCallActionFn
}
