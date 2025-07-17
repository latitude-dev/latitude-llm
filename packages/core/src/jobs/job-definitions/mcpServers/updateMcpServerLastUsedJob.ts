import { Job } from 'bullmq'
import { Result } from '../../../lib/Result'
import { McpServerRepository } from '../../../repositories'
import { updateMcpServerLastUsed } from '../../../services/mcpServers/updateLastUsed'

export interface UpdateMcpServerLastUsedJobData {
  workspaceId: number
  mcpServerId: number
}

export const updateMcpServerLastUsedJob = async (
  job: Job<UpdateMcpServerLastUsedJobData>,
) => {
  const { workspaceId, mcpServerId } = job.data

  const mcpServerRepo = new McpServerRepository(workspaceId)
  const mcpServerResult = await mcpServerRepo.find(mcpServerId)

  if (Result.isOk(mcpServerResult)) {
    await updateMcpServerLastUsed(mcpServerResult.value)
  }
}
