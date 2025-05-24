import { Commit, Project, Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'

export type CopilotTool<P extends { [key: string]: unknown } = {}> = ({
  workspace,
  project,
  parameters,
}: {
  workspace: Workspace
  project: Project
  commit: Commit
  parameters: P
}) => PromisedResult<unknown>
