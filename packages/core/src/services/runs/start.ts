import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import { updateActiveRunByDocument } from './active/byDocument/update'

export async function startRun({
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
  activeDeploymentTest,
  parameters,
  customIdentifier,
  tools,
  userMessage,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
  activeDeploymentTest?: DeploymentTest
  parameters?: Record<string, unknown>
  customIdentifier?: string | null
  tools?: string[]
  userMessage?: string
}) {
  const startedAt = new Date()
  const updateResult = await updateActiveRunByDocument({
    workspaceId,
    projectId,
    documentUuid,
    runUuid,
    updates: { startedAt },
  })
  if (!Result.isOk(updateResult)) return updateResult

  const run = updateResult.unwrap()
  await publisher.publishLater({
    type: 'documentRunStarted',
    data: {
      eventContext: 'background',
      projectId,
      workspaceId,
      documentUuid,
      commitUuid,
      run,
      activeDeploymentTest,
      parameters,
      customIdentifier,
      tools,
      userMessage,
    },
  })

  return updateResult
}
