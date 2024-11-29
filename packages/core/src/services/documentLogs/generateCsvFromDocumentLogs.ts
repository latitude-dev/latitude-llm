import { CsvData, Workspace } from '../../browser'
import { LatitudeError, NotFoundError, PromisedResult, Result } from '../../lib'
import { DocumentLogsRepository } from '../../repositories'

export async function generateCsvFromDocumentLogs({
  workspace,
  documentLogIds,
}: {
  workspace: Workspace
  documentLogIds: number[]
}): PromisedResult<CsvData, LatitudeError> {
  const documentLogsScope = new DocumentLogsRepository(workspace.id)

  const documentLogsResult = await documentLogsScope.findMany(documentLogIds)
  if (documentLogsResult.error) return Result.error(documentLogsResult.error)

  const documentLogs = documentLogsResult
    .unwrap()
    .sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
    )
  if (documentLogs.length !== documentLogIds.length) {
    const missingDocumentLogIds = documentLogIds.filter(
      (id) => !documentLogs.find((log) => log.id === id),
    )

    return Result.error(
      new NotFoundError(
        `Document logs not found with ids: ${missingDocumentLogIds.join(', ')}`,
      ),
    )
  }

  const parameterKeys = documentLogs.reduce((keys: Set<string>, log) => {
    const logParamsKeys = Object.keys(log.parameters)
    logParamsKeys.forEach((key) => keys.add(key))
    return keys
  }, new Set<string>())

  return Result.ok({
    headers: Array.from(parameterKeys),
    data: documentLogs.map((log) => ({
      record: Array.from(parameterKeys).reduce(
        (record, key) => {
          record[key] = JSON.stringify(log.parameters[key]) ?? ''
          return record
        },
        {} as Record<string, string>,
      ),
      info: {
        columns: Array.from(parameterKeys).map((key) => ({ name: key })),
      },
    })),
  })
}
