import { ExperimentsRepository } from '../../../../repositories'
import { WebsocketClient } from '../../../../websockets/workers'

export async function sendProgressUpdateActivityHandler({
  workspaceId,
  experimentUuid,
  progress,
}: {
  workspaceId: number
  experimentUuid: string
  progress: {
    total: number
    completed: number
    passed: number
    failed: number
    errors: number
    totalScore: number
  }
}): Promise<void> {
  const experimentsRepository = new ExperimentsRepository(workspaceId)
  const experiment = await experimentsRepository
    .findByUuid(experimentUuid)
    .then((r) => r.unwrap())

  WebsocketClient.sendEvent('experimentStatus', {
    workspaceId,
    data: {
      experiment: {
        ...experiment,
        results: progress,
      },
    },
  })
}
