import path from 'path'
import { nanoid } from 'nanoid'

import slugify from '@sindresorhus/slugify'

import { User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import {
  BadRequestError,
  databaseErrorCodes,
  Result,
  Transaction,
} from '../../lib'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { syncReadCsv } from '../../lib/readCsv'
import { datasetsV2 } from '../../schema'
import { DatabaseError } from 'pg'

type HashAlgorithmFn = (len: number) => string
const buildColumn = (hashAlgorithm: HashAlgorithmFn) => (column: string) => {
  return {
    identifier: hashAlgorithm(7),
    name: column,
  }
}

export const createDataset = async (
  {
    author,
    workspace,
    data,
    disk = diskFactory(),
    hashAlgorithm = nanoid,
  }: {
    author: User
    workspace: Workspace
    data: {
      name: string
      file: File
      csvDelimiter: string
    }
    disk?: DiskWrapper
    hashAlgorithm?: HashAlgorithmFn
  },
  db = database,
) => {
  const name = slugify(data.name)
  const extension = path.extname(data.file.name)
  const key = `workspaces/${workspace.id}/datasets/${name}${extension}`

  const diskResult = await disk.putFile(key, data.file)
  if (diskResult.error) return diskResult

  const readCsvResult = await syncReadCsv(data.file, {
    delimiter: data.csvDelimiter,
  })

  if (readCsvResult.error) return readCsvResult

  const uniqueHeaders = new Set(readCsvResult.value.headers)

  if (uniqueHeaders.size === 0) {
    return Result.error(new BadRequestError('CSV file must contain headers'))
  }

  if ([...uniqueHeaders].some((h) => h.length === 0)) {
    return Result.error(
      new BadRequestError('CSV header cannot be an empty string'),
    )
  }

  const columns = Array.from(uniqueHeaders.keys()).map(
    buildColumn(hashAlgorithm),
  )
  return Transaction.call(async (trx) => {
    try {
      const inserts = await trx
        .insert(datasetsV2)
        .values({
          name: data.name,
          workspaceId: workspace.id,
          authorId: author.id,
          columns,
        })
        .returning()

      const dataset = inserts[0]!

      publisher.publishLater({
        type: 'datasetUploaded',
        data: {
          workspaceId: workspace.id,
          datasetId: dataset.id,
          fileKey: key,
          csvDelimiter: data.csvDelimiter,
          userEmail: author.email,
        },
      })

      return Result.ok({
        fileKey: key,
        dataset: {
          ...dataset,
          author: {
            id: author.id,
            name: author.name,
          },
        },
      })
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.code === databaseErrorCodes.uniqueViolation) {
          if (error.constraint?.includes('name')) {
            throw new BadRequestError('A dataset with this name already exists')
          }
        }
      }

      throw error
    }
  }, db)
}
