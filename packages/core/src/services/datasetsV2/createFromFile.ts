import path from 'path'
import slugify from '@sindresorhus/slugify'

import { User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { BadRequestError, Result } from '../../lib'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { syncReadCsv } from '../../lib/readCsv'
import { buildColumns, HashAlgorithmFn, nanoidHashAlgorithm } from './utils'
import { createDataset } from './create'
import { Column } from '../../schema'

export const createDatasetFromFile = async (
  {
    author,
    workspace,
    data,
    disk = diskFactory(),
    hashAlgorithm = nanoidHashAlgorithm,
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

  let columns: Column[] = []
  const newColumns = Array.from(uniqueHeaders.keys()).map((columnName) => ({
    name: columnName,
  }))
  columns = buildColumns({
    newColumns,
    prevColumns: columns,
    hashAlgorithm,
  })

  const result = await createDataset(
    {
      author,
      workspace,
      data: { name: data.name, columns },
    },
    db,
  )
  if (result.error) return result

  const dataset = result.value

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
}
