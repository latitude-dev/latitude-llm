import path from 'path'

import slugify from '@sindresorhus/slugify'

import { SafeWorkspace, User } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { DiskWrapper } from '../../lib/disk'
import { syncReadCsv } from '../../lib/readCsv'
import { datasets } from '../../schema'

export const createDataset = async (
  {
    author,
    workspace,
    disk,
    data,
  }: {
    author: User
    workspace: SafeWorkspace
    data: {
      name: string
      file: File
      csvDelimiter: string
    }
    disk: DiskWrapper
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

  return Transaction.call(async (trx) => {
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

    return Result.ok({
      ...dataset,
      author: {
        id: author.id,
        name: author.name,
      },
    })
  }, db)
}
