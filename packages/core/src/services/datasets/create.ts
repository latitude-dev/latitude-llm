import pg from 'pg'
import { User, Workspace } from '../../browser'
import { BadRequestError, databaseErrorCodes } from '../../lib/errors'
import { syncReadCsv } from '../../lib/readCsv'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { datasets } from '../../schema'
import { Column } from '../../schema/models/datasets'
import { buildColumns, HashAlgorithmFn, nanoidHashAlgorithm } from './utils'
const { DatabaseError } = pg

export async function getCsvAndBuildColumns({
  file,
  csvDelimiter,
  hashAlgorithm = nanoidHashAlgorithm,
}: {
  file: File | string
  csvDelimiter: string
  hashAlgorithm?: HashAlgorithmFn
}) {
  const readCsvResult = await syncReadCsv(file, {
    delimiter: csvDelimiter,
  })

  if (!Result.isOk(readCsvResult)) return Result.error(readCsvResult.error)

  const headers = readCsvResult.value?.headers ?? []
  const uniqueHeaders = new Set(headers)

  if (uniqueHeaders.size === 0) {
    return Result.error(new BadRequestError('CSV file must contain headers'))
  }

  if ([...uniqueHeaders].some((h) => h.length === 0)) {
    return Result.error(
      new BadRequestError('CSV header cannot be an empty string'),
    )
  }

  const columns: Column[] = []
  const newColumns = Array.from(uniqueHeaders.keys()).map((columnName) => ({
    name: columnName,
  }))
  return Result.ok(
    buildColumns({
      newColumns,
      prevColumns: columns,
      hashAlgorithm,
    }),
  )
}

export const createDataset = async (
  {
    author,
    workspace,
    data,
  }: {
    author: User
    workspace: Workspace
    data: {
      name: string
      columns: Column[]
    }
  },
  transaction = new Transaction(),
) => {
  return transaction.call(async (trx) => {
    try {
      const inserts = await trx
        .insert(datasets)
        .values({
          name: data.name,
          workspaceId: workspace.id,
          authorId: author.id,
          columns: data.columns,
        })
        .returning()

      const dataset = inserts[0]!

      return Result.ok({
        ...dataset,
        author: {
          id: author.id,
          name: author.name,
        },
      })
    } catch (e) {
      const error = 'cause' in (e as Error) ? (e as Error).cause : undefined
      if (error instanceof DatabaseError) {
        if (error.code === databaseErrorCodes.uniqueViolation) {
          if (error.constraint?.includes('name')) {
            throw new BadRequestError('A dataset with this name already exists')
          }
        }
      }

      throw error
    }
  })
}
