import { Workspace } from '../../../browser'
import { getCachedChain } from '../../chains/chainCache'

export async function findPausedChain({
  workspace,
  documentLogUuid,
}: {
  workspace: Workspace
  documentLogUuid: string | undefined
}) {
  const cachedData = await getCachedChain({ workspace, documentLogUuid })
  if (!cachedData) return undefined

  return {
    pausedChain: cachedData.chain,
    previousResponse: cachedData.previousResponse,
  }
}
