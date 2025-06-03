import { Workspace } from '../../../browser'
import {
  DocumentLogWithMetadataAndError,
  ProviderLogsRepository,
} from '../../../repositories'
import { buildProviderLogResponse } from '../../providerLogs'

export type ProviderOutput = { output: string; generatedAt: Date }

export async function findProviderOutputs(
  workspace: Workspace,
  logs: DocumentLogWithMetadataAndError[],
) {
  const repo = new ProviderLogsRepository(workspace.id)
  const providerLogs = await repo.findManyByDocumentLogUuid(
    logs.map((log) => log.uuid),
  )

  return providerLogs.reduce(
    (acc, providerLog) => {
      if (!providerLog.documentLogUuid) return acc
      if (providerLog.generatedAt === null) return acc

      const existing = acc.get(providerLog.documentLogUuid)

      if (existing && existing.generatedAt > providerLog.generatedAt) return acc

      const output = buildProviderLogResponse(providerLog)

      acc.set(providerLog.documentLogUuid, {
        output,
        generatedAt: providerLog.generatedAt,
      })
      return acc
    },
    new Map() as Map<string, ProviderOutput>,
  )
}
