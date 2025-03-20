import path from 'path'

import slugify from '@sindresorhus/slugify'
import pg from 'pg'
const { DatabaseError } = pg

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
import { datasets } from '../../schema'

export const createDataset = async (
  {
    author,
    workspace,
    disk = diskFactory(),
    data,
  }: {
    author: User
    workspace: Workspace
    data: {
      name: string
      file: File
      csvDelimiter: string
    }
    disk?: DiskWrapper
  },
  db = database,
) => {
  const name = slugify(data.name)
  const extension = path.extname(data.file.name)
  const key = `workspaces/${workspace.id}/datasets/${name}${extension}`

  const diskResult = await disk.putFile(key, data.file)
  if (diskResult.error) return diskResult

  const file = disk.file(key)
  const fileMetadata = await file.toSnapshot()
  const readCsvResult = await syncReadCsv(data.file, {
    delimiter: data.csvDelimiter,
  })

  if (readCsvResult.error) return readCsvResult

  const { headers, rowCount } = readCsvResult.value
  if (headers.length === 0)
    return Result.error(new BadRequestError('CSV file must contain headers'))
  if (headers.some((h) => h.length === 0))
    return Result.error(
      new BadRequestError('CSV header cannot be an empty string'),
    )

  return Transaction.call(async (trx) => {
    try {
      const inserts = await trx
        .insert(datasets)
        .values({
          name: data.name,
          csvDelimiter: data.csvDelimiter,
          workspaceId: workspace.id,
          authorId: author.id,
          fileKey: key,
          fileMetadata: {
            ...fileMetadata,
            headers,
            rowCount,
          },
        })
        .returning()

      const dataset = inserts[0]!

      publisher.publishLater({
        type: 'datasetCreated',
        data: {
          dataset: {
            ...dataset,
            author,
          },
          workspaceId: workspace.id,
          userEmail: author.email,
        },
      })

      return Result.ok({
        ...dataset,
        author: {
          id: author.id,
          name: author.name,
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
