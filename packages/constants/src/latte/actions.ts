import { DocumentVersion } from '../models'

interface ILatteDraftAction {
  type: 'prompt'
  operation: 'create' | 'update' | 'delete'
}

type LatteCreatePromptAction = ILatteDraftAction & {
  operation: 'create'
  path: string
  content: string
}

type LatteUpdatePromptAction = ILatteDraftAction & {
  operation: 'update'
  promptUuid: string
  path?: string
  content?: string
}

type LatteDeletePromptAction = ILatteDraftAction & {
  operation: 'delete'
  promptUuid: string
}

export type LatteEditAction =
  | LatteCreatePromptAction
  | LatteUpdatePromptAction
  | LatteDeletePromptAction

export type LatteChange = {
  projectId: number
  draftUuid: string
  previous: DocumentVersion | null
  current: DocumentVersion
}
