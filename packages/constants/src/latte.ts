export type LatteContext = {
  path: string
  projectId?: number
  commitUuid?: string
  documentUuid?: string
  evaluationUuid?: string
}

export enum LatteTool {
  listProjects = 'list_projects',
  listPrompts = 'list_prompts',
  readPrompt = 'read_prompt',
}
